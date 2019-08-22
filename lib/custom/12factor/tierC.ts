import {LeinDeps} from "@atomist/sdm-pack-clojure/lib/fingerprints/clojure";
import {FP, NpmDeps} from "@atomist/sdm-pack-fingerprints";
import {CsProjectTargetFrameworks} from "../../aspect/microsoft/CsProjectTargetFrameworks";
import {PythonDependencies} from "../../aspect/python/pythonDependencies";
import {DirectMavenDependencies} from "../../aspect/spring/directMavenDependencies";

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
