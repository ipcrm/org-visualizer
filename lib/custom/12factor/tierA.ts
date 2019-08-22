import {DockerPorts} from "@atomist/sdm-pack-docker";
import {Aspect, FP, sha256} from "@atomist/sdm-pack-fingerprints";
import {K8sObject, K8sSpecs} from "../../aspect/k8s/spec";

export const TwelveFactorTierAType: string = "12facter-tier-a";
/**
 * Does this repository meet requirements for Tier A?
 */
export const TwelveFactorTierA: Aspect<{ meetsRequirements: boolean }> = {
    name: TwelveFactorTierAType,
    displayName: "Twelve Factor Tier A Compliant",
    extract: async () => [],
    consolidate: async fps => {
        const data = { meetsRequirements: meetsTierARequirements(fps) };
        return {
            name: TwelveFactorTierAType,
            type: TwelveFactorTierAType,
            data,
            sha: sha256(JSON.stringify(data)),
        };
    },
    toDisplayableFingerprint: fp => fp.data.meetsRequirements ? "Yes" : "No",
};

export function meetsTierARequirements(fps: FP[]): boolean {
    let meetsReqs = 0;
    for (const fp of fps) {
        // Using K8s?
        if (fp.type === K8sSpecs.name && (fp.data as Array<FP<K8sObject>>).length > 0) {
            meetsReqs++;
        }

        // Expose Ports
        if (fp.type === DockerPorts.name && fp.data.length > 0) {
            meetsReqs++;
        }
    }
    return meetsReqs >= 1;
}

export const isTierACompliant = {
    name: "isTierACompliant",
    description: "Facter 12 Tier A Compliant",
    test: fp => fp.name === TwelveFactorTierAType && fp.data.meetsRequirements,
};
