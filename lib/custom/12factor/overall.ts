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
    name: "twelve-factor-compliant",
    description: "Twelve Factor Compliant",
    test: fps => {
        const a = fps.find(fp => fp.type === TwelveFactor.name && fp.name === "tier-a").data;
        const b = fps.find(fp => fp.type === TwelveFactor.name && fp.name === "tier-b").data;
        const c = fps.find(fp => fp.type === TwelveFactor.name && fp.name === "tier-c").data;
        return a.compliant && b.compliant && c.compliant;
    },
};

export const twelveFactorTierA: CombinationTagger = {
    name: "twelve-factor-tier-a",
    description: "Twelve Factor Tier A Compliant",
    test: fps => {
        const a = fps.find(fp => fp.type === TwelveFactor.name && fp.name === "tier-a").data;
        return a.compliant;
    },
};

export const twelveFactorTierB: CombinationTagger = {
    name: "twelve-factor-tier-b",
    description: "Twelve Factor Tier B Compliant",
    test: fps => {
        const b = fps.find(fp => fp.type === TwelveFactor.name && fp.name === "tier-b").data;
        return b.compliant;
    },
};

export const twelveFactorTierC: CombinationTagger = {
    name: "twelve-factor-tier-c",
    description: "Twelve Factor Tier C Compliant",
    test: fps => {
        const c = fps.find(fp => fp.type === TwelveFactor.name && fp.name === "tier-c").data;
        return c.compliant;
    },
};

export function isTwelveFactor(): RepositoryScorer {
    return async repo => {
        let score = 0;
        const a = repo.analysis.fingerprints.find(fp => fp.type === TwelveFactor.name && fp.name === "tier-a").data;
        const b = repo.analysis.fingerprints.find(fp => fp.type === TwelveFactor.name && fp.name === "tier-b").data;
        const c = repo.analysis.fingerprints.find(fp => fp.type === TwelveFactor.name && fp.name === "tier-c").data;
        if (a.compliant) { score++; }
        if (b.compliant) { score++; }
        if (c.compliant) { score++; }

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
