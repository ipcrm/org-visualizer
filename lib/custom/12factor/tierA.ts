import {DockerPorts} from "@atomist/sdm-pack-docker";
import {FP} from "@atomist/sdm-pack-fingerprints";
import {K8sObject, K8sSpecs} from "../../aspect/k8s/spec";

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
