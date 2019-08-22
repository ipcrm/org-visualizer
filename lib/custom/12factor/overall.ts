import {Aspect, sha256} from "@atomist/sdm-pack-fingerprints";
import {CombinationTagger, RepositoryScorer} from "../../aspect/AspectRegistry";
import {FiveStar} from "../../scorer/Score";
import {meetsTierARequirements} from "./tierA";
import {meetsTierBRequirements} from "./tierB";
import {meetsTierCRequirements} from "./tierC";

interface TwelveFactorData {
    compliant: boolean;
}

export const TwelveFactorOverallType = "twelve-facter-overall";
export const TwelveFactor: Aspect<TwelveFactorData> = {
    name: TwelveFactorOverallType,
    displayName: "Twelve Factor Compliance",
    extract: async () => [],
    consolidate: async fps => {
        const data: Record<string, TwelveFactorData> = {
            a: {compliant: meetsTierARequirements(fps)},
            b: {compliant: meetsTierBRequirements(fps)},
            c: {compliant: meetsTierCRequirements(fps)},
        };

        return [
            {
                name: "tier-a",
                type: TwelveFactorOverallType,
                data: data.a,
                sha: sha256(JSON.stringify(data.a)),
            },
            {
                name: "tier-b",
                type: TwelveFactorOverallType,
                data: data.b,
                sha: sha256(JSON.stringify(data.b)),
            },
            {
                name: "tier-c",
                type: TwelveFactorOverallType,
                data: data.c,
                sha: sha256(JSON.stringify(data.b)),
            },
        ];
    },
    toDisplayableFingerprintName: fp => {
        let name: string;
        if (fp === "tier-a") {
            name = "Twelve Factor Tier A Compliant";
        } else if (fp === "tier-b") {
            name = "Twelve Factor Tier B Compliant";
        } else if (fp === "tier-c") {
            name = "Twelve Factor Tier C Compliant";
        }

        return name;
    },
    toDisplayableFingerprint: fp => fp.data.compliant ? "Yes" : "No",
};

export const twelveFactorOverAll: CombinationTagger = {
    name: "twelveFactorOverall",
    description: "Twelve Factor Compliant",
    test: fps => {
        const data = fps.find(fp => fp.type === TwelveFactor.name).data;
        return data.a.compliant && data.b.compliant && data.c.compliant;
    },
};

export const twelveFactorTierA: CombinationTagger = {
    name: "twelveFactorTierA",
    description: "Twelve Factor Tier A Compliant",
    test: fps => {
        const data = fps.find(fp => fp.type === TwelveFactor.name).data;
        return data.a.compliant;
    },
};

export const twelveFactorTierB: CombinationTagger = {
    name: "twelveFactorTierB",
    description: "Twelve Factor Tier B Compliant",
    test: fps => {
        const data = fps.find(fp => fp.type === TwelveFactor.name).data;
        return data.b.compliant;
    },
};

export const twelveFactorTierC: CombinationTagger = {
    name: "twelveFactorTierC",
    description: "Twelve Factor Tier C Compliant",
    test: fps => {
        const data = fps.find(fp => fp.type === TwelveFactor.name).data;
        return data.c.compliant;
    },
};

export function isTwelveFactor(): RepositoryScorer {
    return async repo => {
        let score = 0;
        const data = repo.analysis.fingerprints.find(fp => fp.type === TwelveFactor.name).data;
        if (data.a.compliant) { score++; }
        if (data.b.compliant) { score++; }
        if (data.c.compliant) { score++; }

        if (score === 3) {
            score = 5; // Set to best possible for satisfying reqs
        }

        return {
            name: "twelve-factor",
            score: score as FiveStar,
            reason: `Scored ${score} based on discovered 12 Factor readiness`,
        };
    };
}
