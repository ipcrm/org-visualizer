import {projectUtils} from "@atomist/automation-client";
import {Aspect, FP, sha256} from "@atomist/sdm-pack-fingerprints";

export const HasEnvFilesType = "has-env-files";
export const HasEnvFiles: Aspect<{ files: string[] }> = {
    name: HasEnvFilesType,
    displayName: "Has Environment Configuration Files",
    extract: async p => {
        const files = [];
        await projectUtils.doWithFiles(p, "**/env/*.yaml", async f => {
            const content = await f.getContent();
            if (content.length > 0) {
                files.push(f.path);
            }
        });

        const data = { files };
        return {
            type: HasEnvFilesType,
            name: HasEnvFilesType,
            data,
            sha: sha256(JSON.stringify(data)),
        };
    },
    toDisplayableFingerprint: fp => fp.data.files.length > 0 ?
        fp.data.files.map(f => f.split("/").pop() ).join(",") : "None",
};

export function meetsTierBRequirements(fps: FP[]): boolean {
    let meetsReqs = false;
    for (const fp of fps) {
        if (fp.type === HasEnvFilesType && fp.data.files.length > 0) {
            meetsReqs = true;
            break;
        }
    }
    return meetsReqs;
}

