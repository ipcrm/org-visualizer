import {Aspect, sha256} from "@atomist/sdm-pack-fingerprints";
import {CombinationTagger, RepositoryScorer} from "../../aspect/AspectRegistry";
import {CodeMetricsType} from "../../aspect/common/codeMetrics";
import {FiveStar} from "../../scorer/Score";
import {adjustBy} from "../../scorer/scoring";
import {meetsTierARequirements, TwelveFactorTierA, TwelveFactorTierAType} from "./tierA";
import {meetsTierBRequirements, TwelveFactorTierB} from "./tierB";
import {meetsTierCRequirements, TwelveFactorTierC} from "./tierC";

export const twelveFactorOverAll: CombinationTagger = {
    name: "twelveFactorOverall",
    description: "Twelve Factor Compliant",
    test: fps => {
        const a = fps.find(fp => fp.type === TwelveFactorTierA.name).data.meetsRequirements;
        const b = fps.find(fp => fp.type === TwelveFactorTierB.name).data.meetsRequirements;
        const c = fps.find(fp => fp.type === TwelveFactorTierC.name).data.meetsRequirements;

        return a && b && c;
    },
};

interface TwelveFacterData {
    tierA: boolean;
    tierB: boolean;
    tierC: boolean;
}

export const TwelveFactorOverallType = "twelve-facter-overall";
export const TwelveFactor: Aspect<TwelveFacterData> = {
    name: TwelveFactorOverallType,
    displayName: "Twelve Factor Compliant",
    extract: async () => [],
    consolidate: async fps => {
        const data: TwelveFacterData = {
            tierA: meetsTierARequirements(fps),
            tierB: meetsTierBRequirements(fps),
            tierC: meetsTierCRequirements(fps),
        };
        return {
            name: TwelveFactorOverallType,
            type: TwelveFactorOverallType,
            data,
            sha: sha256(JSON.stringify(data)),
        };
    },
    toDisplayableFingerprint: fp => fp.data.tierA && fp.data.tierB && fp.data.tierC ? "Yes" : "No",
};

export function isTwelveFactor(): RepositoryScorer {
    return async repo => {
        let score = 0;
        const a = repo.analysis.fingerprints.find(fp => fp.type === TwelveFactorTierA.name).data.meetsRequirements;
        const b = repo.analysis.fingerprints.find(fp => fp.type === TwelveFactorTierB.name).data.meetsRequirements;
        const c = repo.analysis.fingerprints.find(fp => fp.type === TwelveFactorTierC.name).data.meetsRequirements;
        if (a) { score++; }
        if (b) { score++; }
        if (c) { score++; }

        if (score === 3) {
            score = 5; // Set to best possible for satisfying reqs
        }

        return {
            name: "twelve-facter",
            score: score as FiveStar,
            reason: `Scored ${score} based on discovered 12 Factor readiness`,
        };
    };
}
