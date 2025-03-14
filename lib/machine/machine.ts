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
    Configuration,
} from "@atomist/automation-client";
import {
    VirtualProjectFinder,
} from "@atomist/sdm-pack-fingerprints";
import { Aspect } from "@atomist/sdm-pack-fingerprints/lib/machine/Aspect";
import * as _ from "lodash";
import { Pool } from "pg";
import { ClientFactory } from "../analysis/offline/persist/pgUtils";
import { PostgresProjectAnalysisResultStore } from "../analysis/offline/persist/PostgresProjectAnalysisResultStore";
import { ProjectAnalysisResultStore } from "../analysis/offline/persist/ProjectAnalysisResultStore";
import { Analyzer } from "../analysis/offline/spider/Spider";
import { SpiderAnalyzer } from "../analysis/offline/spider/SpiderAnalyzer";
import { IdealStore } from "../aspect/IdealStore";
import { ProblemStore } from "../aspect/ProblemStore";

export function createAnalyzer(aspects: Aspect[], virtualProjectFinder: VirtualProjectFinder): Analyzer {
    return new SpiderAnalyzer(aspects, virtualProjectFinder);
}

const PoolHolder: { pool: Pool } = { pool: undefined };

export function sdmConfigClientFactory(config: Configuration): ClientFactory {
    if (!PoolHolder.pool) {
        PoolHolder.pool = new Pool({
            database: "org_viz",
            ...(_.get(config, "sdm.postgres") || {}),
        });
    }
    return () => PoolHolder.pool.connect();
}

export function analysisResultStore(factory: ClientFactory): ProjectAnalysisResultStore & IdealStore & ProblemStore {
    return new PostgresProjectAnalysisResultStore(factory);
}
