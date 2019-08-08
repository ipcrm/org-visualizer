/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    GitHubRepoRef,
    logger,
    RemoteRepoRef,
    RepoRef,
} from "@atomist/automation-client";
import { ProjectAnalysis } from "@atomist/sdm-pack-analysis";
import {
    ConcreteIdeal,
    FP,
    Ideal,
    isConcreteIdeal,
} from "@atomist/sdm-pack-fingerprints";
import {
    Client,
    ClientBase,
} from "pg";
import {
    Analyzed,
    ProblemUsage,
} from "../../../aspect/AspectRegistry";
import { IdealStore } from "../../../aspect/IdealStore";
import { getCategories } from "../../../customize/categories";
import {
    BandCasing,
    bandFor,
} from "../../../util/bands";
import { EntropySizeBands } from "../../../util/commonBands";
import {
    isProjectAnalysisResult,
    ProjectAnalysisResult,
} from "../../ProjectAnalysisResult";
import { CohortAnalysis } from "../spider/analytics";
import { SpideredRepo } from "../SpideredRepo";
import {
    ClientFactory,
    doWithClient,
} from "./pgUtils";
import {
    combinePersistResults,
    emptyPersistResult,
    FingerprintKind,
    FingerprintUsage,
    PersistResult,
    ProjectAnalysisResultStore,
} from "./ProjectAnalysisResultStore";

// tslint:disable:max-file-line-count

export class PostgresProjectAnalysisResultStore implements ProjectAnalysisResultStore, IdealStore {

    public distinctRepoCount(workspaceId: string): Promise<number> {
        const sql = `SELECT COUNT(*) FROM (SELECT DISTINCT owner, name FROM repo_snapshots
        WHERE workspace_id ${workspaceId === "*" ? "<>" : "="} $1) as repos`;
        return doWithClient(sql, this.clientFactory, async client => {
            const result = await client.query(sql,
                [workspaceId]);
            return +result.rows[0].count;
        });
    }

    public latestTimestamp(workspaceId: string): Promise<Date> {
        const sql = `SELECT timestamp FROM repo_snapshots WHERE workspace_id ${workspaceId === "*" ? "<>" : "="} $1
        ORDER BY timestamp DESC LIMIT 1`;
        return doWithClient(sql, this.clientFactory, async client => {
            const result = await client.query(sql,
                [workspaceId]);
            return result.rows[0].timestamp;
        });
    }

    public loadInWorkspace(workspaceId?: string): Promise<ProjectAnalysisResult[]> {
        return this.loadInWorkspaceInternal(workspaceId || "*");
    }

    private async loadInWorkspaceInternal(wsid: string,
                                          additionalWhereClause: string = "true",
                                          additionalParameters: any[] = []): Promise<ProjectAnalysisResult[]> {
        // The fingerprints query is expensive so we parallelize the 2 queries
        const getFingerprints = this.fingerprintsInWorkspaceRecord(wsid);

        const repoRowsSql = `SELECT id, owner, name, url, commit_sha, timestamp, workspace_id, string_agg(fingerprint_id, ',') as fingerprint_ids
from repo_snapshots, repo_fingerprints
WHERE workspace_id ${wsid !== "*" ? "=" : "<>"} $1
AND repo_snapshots.id = repo_fingerprints.repo_snapshot_id
AND ${additionalWhereClause}
GROUP BY id`;
        const getRepos = doWithClient(repoRowsSql, this.clientFactory, async client => {
            // Load all fingerprints in workspace so we can look up
            const repoSnapshotRows = await client.query(repoRowsSql, [wsid, ...additionalParameters]);
            return repoSnapshotRows.rows.map(row => {
                const repoRef = rowToRepoRef(row);
                return {
                    id: row.id,
                    owner: row.owner,
                    name: row.name,
                    url: row.url,
                    commitSha: row.commit_sha,
                    timestamp: row.timestamp,
                    workspaceId: row.workingDescription,
                    repoRef,
                    fingerprintIds: row.fingerprint_ids.split(","),
                };
            });
        }, []);
        const [fingerprints, repos] = await Promise.all([getFingerprints, getRepos]);
        // Fill in the remaining information from the fingerprints lookup
        for (const repo of repos) {
            (repo as any).analysis = {
                fingerprints: repo.fingerprintIds.map(fid => fingerprints[fid]),
                id: repo.repoRef,
            };
        }
        return repos;
    }

    public async loadById(id: string): Promise<ProjectAnalysisResult | undefined> {
        const hits = await this.loadInWorkspaceInternal("*", "id = $2", [id]);
        return hits.length === 1 ? hits[0] : undefined;
    }

    public async loadByRepoRef(repo: RepoRef): Promise<ProjectAnalysisResult | undefined> {
        const hits = await this.loadInWorkspaceInternal("*",
            "WHERE owner = $2 AND name = $3 AND commit_sha = $4",
            [repo.owner, repo.repo, repo.sha]);
        return hits.length === 1 ? hits[0] : undefined;
    }

    public async persist(repos: ProjectAnalysisResult | AsyncIterable<ProjectAnalysisResult> | ProjectAnalysisResult[]): Promise<PersistResult> {
        return this.persistAnalysisResults(isProjectAnalysisResult(repos) ? [repos] : repos);
    }

    public async distinctFingerprintKinds(workspaceId: string): Promise<FingerprintKind[]> {
        const sql = `SELECT distinct f.name, feature_name as type
  from repo_fingerprints rf, repo_snapshots rs, fingerprints f
  WHERE rf.repo_snapshot_id = rs.id AND rf.fingerprint_id = f.id AND rs.workspace_id ${workspaceId === "*" ? "<>" : "="} $1`;
        return doWithClient(sql, this.clientFactory, async client => {
            const result = await client.query(sql, [workspaceId]);
            return result.rows;
        }, []);
    }

    public fingerprintUsageForType(workspaceId: string, type?: string): Promise<FingerprintUsage[]> {
        return fingerprintUsageForType(this.clientFactory, workspaceId, type);
    }

    public async storeIdeal(workspaceId: string, ideal: Ideal): Promise<void> {
        if (isConcreteIdeal(ideal)) {
            await doWithClient("Store ideal", this.clientFactory, async client => {
                // Clear out any existing ideal
                await client.query("DELETE FROM ideal_fingerprints WHERE workspace_id = $1 AND fingerprint_id IN " +
                    "(SELECT id from fingerprints where feature_name = $2 AND name = $3)",
                    [workspaceId, ideal.ideal.type, ideal.ideal.name]);
                const fid = await this.ensureFingerprintStored(ideal.ideal, client);
                await client.query(`INSERT INTO ideal_fingerprints (workspace_id, fingerprint_id, authority)
values ($1, $2, 'local-user')`, [
                    workspaceId, fid]);
            });
        } else {
            throw new Error("Elimination ideals not yet supported");
        }
    }

    public async setIdeal(workspaceId: string, fingerprintId: string): Promise<void> {
        const ideal = await this.loadFingerprintById(fingerprintId);
        if (!ideal) {
            throw new Error(`Fingerprint with id=${fingerprintId} not found and cannot be used as an ideal`);
        }
        const ci: ConcreteIdeal = {
            reason: "Local database",
            ideal,
        };
        await this.storeIdeal(workspaceId, ci);
    }

    public async loadIdeals(workspaceId: string): Promise<Ideal[]> {
        const sql = `SELECT id, name, feature_name as type, sha, data
FROM ideal_fingerprints, fingerprints
WHERE workspace_id = $1 AND ideal_fingerprints.fingerprint_id = fingerprints.id`;
        return doWithClient(sql, this.clientFactory, async client => {
            const rows = await client.query(sql, [workspaceId]);
            if (!rows.rows) {
                return [];
            }
            return rows.rows.map(idealRowToIdeal);
        }, []);
    }

    public async noteProblem(workspaceId: string, fingerprintId: string): Promise<void> {
        const fingerprint = await this.loadFingerprintById(fingerprintId);
        if (!fingerprint) {
            throw new Error(`Fingerprint with id=${fingerprintId} not found and cannot be noted as problem`);
        }
        await this.storeProblemFingerprint(workspaceId, { fingerprint, severity: "warn", authority: "local-user" });
    }

    public async storeProblemFingerprint(workspaceId: string, fp: ProblemUsage): Promise<void> {
        const sql = `INSERT INTO problem_fingerprints (workspace_id, fingerprint_id, severity, authority, date_added)
values ($1, $2, $3, $4, current_timestamp)`;
        await doWithClient(sql, this.clientFactory, async client => {
            // Clear out any existing ideal
            const fid = await this.ensureFingerprintStored(fp.fingerprint, client);
            await client.query(sql, [
                workspaceId, fid, fp.severity, fp.authority]);
        });
    }

    public async loadProblems(workspaceId: string): Promise<ProblemUsage[]> {
        const sql = `SELECT id, name, feature_name as type, sha, data, authority, severity, description, url
FROM problem_fingerprints, fingerprints
WHERE workspace_id = $1 AND problem_fingerprints.fingerprint_id = fingerprints.id`;
        return doWithClient(sql, this.clientFactory, async client => {
            const rows = await client.query(sql, [workspaceId]);
            if (!rows.rows) {
                return [];
            }
            return rows.rows.map(problemRowToProblem);
        }, []);
    }

    public async loadIdeal(workspaceId: string, type: string, name: string): Promise<Ideal> {
        const sql = `SELECT id, name, feature_name as type, sha, data
FROM ideal_fingerprints, fingerprints
WHERE workspace_id = $1 AND ideal_fingerprints.fingerprint_id = fingerprints.id
AND feature_name = $2 AND name = $3`;
        const rawRow = await doWithClient(sql, this.clientFactory, async client => {
            const rows = await client.query(sql, [workspaceId, type, name]);
            return rows.rows.length === 1 ? rows.rows[0] : undefined;
        });
        if (!rawRow) {
            return undefined;
        }
        return idealRowToIdeal(rawRow);
    }

    public async loadFingerprintById(id: string): Promise<FP | undefined> {
        const sql = `SELECT id, name, feature_name as type, sha, data FROM fingerprints
WHERE id = $1`;
        return doWithClient(sql, this.clientFactory, async client => {
            const rows = await client.query(sql, [id]);
            return rows.rows.length === 1 ? rows.rows[0] : undefined;
        });
    }

    public async fingerprintsInWorkspace(workspaceId: string, type?: string, name?: string): Promise<Array<FP & { id: string }>> {
        return fingerprintsInWorkspace(this.clientFactory, workspaceId, type, name);
    }

    /**
     * Key is persistent fingerprint id
     */
    private async fingerprintsInWorkspaceRecord(workspaceId: string, type?: string, name?: string): Promise<Record<string, FP & { id: string }>> {
        const fingerprintsArray = await this.fingerprintsInWorkspace(workspaceId, type, name);
        const fingerprints: Record<string, FP & { id: string }> = {};
        fingerprintsArray.forEach(fp => fingerprints[fp.id] = fp);
        return fingerprints;
    }

    public async fingerprintsForProject(snapshotId: string): Promise<FP[]> {
        return fingerprintsForProject(this.clientFactory, snapshotId);
    }

    public async averageFingerprintCount(workspaceId?: string): Promise<number> {
        const sql = `SELECT avg(count) as average_fingerprints from (SELECT repo_snapshots.id, count(feature_name) from repo_snapshots,
(select distinct feature_name, repo_snapshot_id
  FROM repo_fingerprints, fingerprints
  WHERE repo_fingerprints.fingerprint_id = fingerprints.id)
AS aspects
WHERE workspace_id ${workspaceId === "*" ? "<>" : "="} $1
AND repo_snapshot_id = repo_snapshots.id
GROUP by repo_snapshots.id) stats;`;
        return doWithClient(sql, this.clientFactory, async client => {
            const rows = await client.query(sql, [workspaceId || "*"]);
            return rows.rows.length === 1 ? rows.rows[0].average_fingerprints : -1;
        }, () => -1);
    }

    public async persistAnalytics(data: Array<{ workspaceId: string, kind: FingerprintKind, cohortAnalysis: CohortAnalysis }>): Promise<boolean> {
        return doWithClient("Persist analytics", this.clientFactory, async client => {
            for (const { kind, workspaceId, cohortAnalysis } of data) {
                const sql = `INSERT INTO fingerprint_analytics (feature_name, name, workspace_id, entropy, variants, count)
        values ($1, $2, $3, $4, $5, $6)
        ON CONFLICT ON CONSTRAINT fingerprint_analytics_pkey DO UPDATE SET entropy = $4, variants = $5, count = $6`;
                await client.query(sql, [kind.type, kind.name, workspaceId,
                    cohortAnalysis.entropy, cohortAnalysis.variants, cohortAnalysis.count]);
            }
            return true;
        });
    }

    private async persistAnalysisResults(
        analysisResultIterator: AsyncIterable<ProjectAnalysisResult> | ProjectAnalysisResult[]): Promise<PersistResult> {
        return doWithClient("Persist analysis results", this.clientFactory, async client => {
            const persistResults: PersistResult[] = [];
            for await (const analysisResult of analysisResultIterator) {
                persistResults.push(await this.persistOne(client, analysisResult));
            }
            return persistResults.reduce(combinePersistResults, emptyPersistResult);
        }, emptyPersistResult);
    }

    private async persistOne(client: ClientBase, analysisResult: ProjectAnalysisResult): Promise<PersistResult> {
        const repoRef = analysisResult.analysis.id;
        if (!repoRef) {
            return {
                attemptedCount: 1,
                succeeded: [],
                failed: [{
                    repoUrl: "missing repoRef",
                    whileTryingTo: "build object to persist",
                    message: "No RepoRef",
                }],
            };
        }
        if (!repoRef.url || !repoRef.sha) {
            return {
                attemptedCount: 1,
                succeeded: [],
                failed: [{
                    repoUrl: "missing repoUrl. Repo is named " + repoRef.repo,
                    whileTryingTo: "build object to persist",
                    message: `Incomplete RepoRef ${JSON.stringify(repoRef)}`,
                }],
            };
        }

        try {
            // Whack any snapshot we already hold for this repository
            await deleteOldSnapshotForRepository(repoRef, client);

            // Use this as unique database id
            const id = repoRef.url.replace("/", "") + "_" + repoRef.sha;
            const shaToUse = !!(analysisResult.analysis as ProjectAnalysis).gitStatus ?
                (analysisResult.analysis as ProjectAnalysis).gitStatus.sha :
                repoRef.sha;
            await client.query(`
            INSERT INTO repo_snapshots (id, workspace_id, provider_id, owner, name, url, commit_sha, analysis, query, timestamp)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, current_timestamp)`,
                [id,
                    analysisResult.workspaceId,
                    "github",
                    repoRef.owner,
                    repoRef.repo,
                    repoRef.url,
                    shaToUse,
                    analysisResult.analysis,
                    (analysisResult as SpideredRepo).query,
                ]);
            const fingerprintPersistResults = await this.persistFingerprints(analysisResult.analysis, id, client);
            fingerprintPersistResults.failures.forEach(f => {
                logger.error(`Could not persist fingerprint.
                Error: ${f.error.message}
                Repo: ${repoRef.url}
                Fingerprint: ${JSON.stringify(f.failedFingerprint, undefined, 2)}`);
            });
            return {
                succeeded: [id],
                attemptedCount: 1,
                failed: [],
            };
        } catch (err) {
            return {
                attemptedCount: 1,
                succeeded: [],
                failed: [{
                    repoUrl: repoRef.url,
                    whileTryingTo: "persist in DB",
                    message: err.message,
                }],
            };
        }
    }

    // Persist the fingerprints for this analysis
    private async persistFingerprints(pa: Analyzed, id: string, client: ClientBase): Promise<{
        insertedCount: number,
        failures: Array<{ failedFingerprint: FP; error: Error }>,
    }> {
        let insertedCount = 0;
        const failures: Array<{ failedFingerprint: FP; error: Error }> = [];
        for (const fp of pa.fingerprints) {
            const aspectName = fp.type || "unknown";
            const fingerprintId = aspectName + "_" + fp.name + "_" + fp.sha;
            //  console.log("Persist fingerprint " + JSON.stringify(fp) + " for id " + id);
            // Create fp record if it doesn't exist
            try {
                await this.ensureFingerprintStored(fp, client);
                await client.query(`INSERT INTO repo_fingerprints (repo_snapshot_id, fingerprint_id, path)
values ($1, $2, $3) ON CONFLICT DO NOTHING
`, [id, fingerprintId, fp.path]);
                insertedCount++;
            } catch (error) {
                failures.push({ failedFingerprint: fp, error });
            }
        }
        return {
            insertedCount,
            failures,
        };
    }

    /**
     * Persist the given fingerprint if it's not already known
     * @param {FP} fp
     * @param {Client} client
     * @return {Promise<void>}
     */
    private async ensureFingerprintStored(fp: FP, client: ClientBase): Promise<string> {
        const aspectName = fp.type || "unknown";
        const fingerprintId = aspectName + "_" + fp.name + "_" + fp.sha;
        //  console.log("Persist fingerprint " + JSON.stringify(fp) + " for id " + id);
        // Create fp record if it doesn't exist
        await client.query(`INSERT INTO fingerprints (id, name, feature_name, sha, data)
values ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
`, [fingerprintId, fp.name, aspectName, fp.sha, JSON.stringify(fp.data)]);
        return fingerprintId;
    }

    constructor(public readonly clientFactory: ClientFactory) {
    }

}

function idealRowToIdeal(rawRow: any): Ideal {
    if (!!rawRow.data) {
        const result: ConcreteIdeal = {
            ideal: rawRow,
            reason: `Local database row ${rawRow.id}`,
        };
        return result;
    }
    throw new Error("Elimination ideals not yet supported");
}

function problemRowToProblem(rawRow: any): ProblemUsage {
    return {
        fingerprint: {
            name: rawRow.name,
            type: rawRow.feature_name,
            data: rawRow.data,
            sha: rawRow.sha,
        },
        authority: rawRow.authority,
        severity: rawRow.severity,
        description: rawRow.description,
        url: rawRow.url,
    };
}

/**
 * Raw fingerprints in the workspace
 * @return {Promise<FP[]>}
 */
async function fingerprintsInWorkspace(clientFactory: ClientFactory,
                                       workspaceId: string,
                                       type?: string,
                                       name?: string): Promise<Array<FP & { id: string }>> {
    const sql = `SELECT DISTINCT f.name as fingerprintName, f.id, f.feature_name, f.sha, f.data, rs.path
FROM repo_fingerprints rf, repo_snapshots rs, fingerprints f
WHERE rf.repo_snapshot_id = rs.id AND rf.fingerprint_id = f.id AND rs.workspace_id ${workspaceId === "*" ? "<>" : "="} $1
AND ${type ? "feature_name = $2" : "true"} AND ${name ? "f.name = $3" : "true"}
ORDER BY feature_name, fingerprintName ASC`;
    return doWithClient(sql, clientFactory, async client => {
        const params = [workspaceId];
        if (!!type) {
            params.push(type);
        }
        if (!!name) {
            params.push(name);
        }

        const rows = await client.query(sql, params);
        return rows.rows.map(row => {
            return {
                id: row.id,
                name: row.fingerprintname,
                type: row.feature_name,
                sha: row.sha,
                data: row.data,
                path: row.path,
            };
        });
    }, []);
}

async function fingerprintsForProject(clientFactory: ClientFactory,
                                      snapshotId: string): Promise<FP[]> {
    const sql = `SELECT f.name as fingerprintName, f.feature_name, f.sha, f.data
FROM repo_fingerprints rf, repo_snapshots rs, fingerprints f
WHERE rs.id = $1 AND rf.repo_snapshot_id = rs.id AND rf.fingerprint_id = f.id
ORDER BY feature_name, fingerprintName ASC`;
    return doWithClient(sql, clientFactory, async client => {
        const rows = await client.query(sql, [snapshotId]);
        return rows.rows.map(row => {
            return {
                name: row.fingerprintname,
                type: row.feature_name,
                sha: row.sha,
                data: row.data,
            };
        });
    }, []);
}

async function fingerprintUsageForType(clientFactory: ClientFactory, workspaceId: string, type?: string): Promise<FingerprintUsage[]> {
    const sql = `SELECT name, feature_name as type, variants, count, entropy, compliance
FROM fingerprint_analytics f
WHERE f.workspace_id ${workspaceId === "*" ? "!=" : "="} $1
AND  ${type ? "f.feature_name = $2" : "true"}
ORDER BY entropy DESC`;
    return doWithClient<FingerprintUsage[]>(sql, clientFactory, async client => {
        const params = [workspaceId];
        if (!!type) {
            params.push(type);
        }
        const rows = await client.query(sql, params);
        return rows.rows.map(r => ({
            name: r.name,
            type: r.type,
            variants: +r.variants,
            count: +r.count,
            entropy: +r.entropy,
            compliance: +r.compliance,
            entropy_band: bandFor(EntropySizeBands, +r.entropy, { casing: BandCasing.Sentence, includeNumber: false }),
            // This is really confusing but the Aspect.name is feature_name alias type in the db
            categories: getCategories({ name: r.type }),
        }));
    }, []);
}

/**
 * Delete the data we hold for this repository.
 */
async function deleteOldSnapshotForRepository(repoRef: RepoRef, client: ClientBase): Promise<void> {
    await client.query(`DELETE from repo_fingerprints WHERE repo_snapshot_id IN
            (SELECT id from repo_snapshots WHERE url = $1)`,
        [repoRef.url]);
    await client.query(`DELETE from repo_snapshots WHERE url = $1`,
        [repoRef.url]);
}

// TODO GitHub only
function rowToRepoRef(row: { provider_id: string, owner: string, name: string, url: string, sha: string }): RemoteRepoRef {
    return GitHubRepoRef.from({
        ...row,
        repo: row.name,
    });
}
