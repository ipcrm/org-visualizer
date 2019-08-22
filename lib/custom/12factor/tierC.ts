import {LeinDeps} from "@atomist/sdm-pack-clojure/lib/fingerprints/clojure";
import {Aspect, FP, NpmDeps, sha256} from "@atomist/sdm-pack-fingerprints";
import {CsProjectTargetFrameworks} from "../../aspect/microsoft/CsProjectTargetFrameworks";
import {PythonDependencies} from "../../aspect/python/pythonDependencies";
import {DirectMavenDependencies} from "../../aspect/spring/directMavenDependencies";

/**
 * Does this repository meet requirements for Tier C?
 */
export const TwelveFactorTierCType: string = "12facter-tier-c";
export const TwelveFactorTierC: Aspect<{ meetsRequirements: boolean }> = {
    name: TwelveFactorTierCType,
    displayName: "Twelve Factor Tier C Compliant",
    extract: async () => [],
    consolidate: async fps => {
        const data = { meetsRequirements: meetsTierCRequirements(fps) };
        return {
            name: TwelveFactorTierCType,
            type: TwelveFactorTierCType,
            data,
            sha: sha256(JSON.stringify(data)),
        };
    },
    toDisplayableFingerprint: fp => fp.data.meetsRequirements ? "Yes" : "No",
};

export function meetsTierCRequirements(fps: FP[]): boolean {
    let hasDepsDefined = false;
    const testFor = [
        PythonDependencies.name,
        DirectMavenDependencies.name,
        LeinDeps.name,
        CsProjectTargetFrameworks.name,
        NpmDeps.name,
    ];
    for (const fp of fps) {
        if (testFor.includes(fp.type) && !!fp.data) {
            hasDepsDefined = true;
            break;
        }
    }

    return hasDepsDefined;
}

export const isTierCCompliant = {
    name: "isTierCCompliant",
    description: "Facter 12 Tier C Compliant",
    test: fp => {
       if (fp.name === TwelveFactorTierCType) {
           return fp.data.meetsRequirements;
       };
    },
};
