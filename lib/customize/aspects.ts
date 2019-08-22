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

import { LeinDeps } from "@atomist/sdm-pack-clojure/lib/fingerprints/clojure";
import {
    DockerfilePath,
    DockerFrom,
    DockerPorts,
} from "@atomist/sdm-pack-docker";
import {
    Aspect,
    cachingVirtualProjectFinder,
    fileNamesVirtualProjectFinder,
    makeVirtualProjectAware,
    VirtualProjectFinder,
} from "@atomist/sdm-pack-fingerprints";
import { CodeMetricsAspect } from "../aspect/common/codeMetrics";
import { CodeOwnership } from "../aspect/common/codeOwnership";
import { CodeOfConduct } from "../aspect/community/codeOfConduct";
import {
    License,
    LicensePresence,
} from "../aspect/community/license";
import {
    ChangelogAspect,
    ContributingAspect,
} from "../aspect/community/oss";
import { globAspect } from "../aspect/compose/globAspect";
import { branchCount } from "../aspect/git/branchCount";
import { GitRecency } from "../aspect/git/gitActivity";
import { K8sSpecs } from "../aspect/k8s/spec";
import { CsProjectTargetFrameworks } from "../aspect/microsoft/CsProjectTargetFrameworks";
import { NpmDependencies } from "../aspect/node/npmDependencies";
import { TypeScriptVersion } from "../aspect/node/TypeScriptVersion";
import { PythonDependencies } from "../aspect/python/pythonDependencies";
import { ExposedSecrets } from "../aspect/secret/exposedSecrets";
import { DirectMavenDependencies } from "../aspect/spring/directMavenDependencies";
import { SpringBootStarter } from "../aspect/spring/springBootStarter";
import { SpringBootVersion } from "../aspect/spring/springBootVersion";
import { TravisScriptsAspect } from "../aspect/travis/travisAspects";
import {TwelveFactor} from "../custom/12factor/overall";
import {TwelveFactorTierA} from "../custom/12factor/tierA";
import {HasEnvFiles, TwelveFactorTierB} from "../custom/12factor/tierB";
import {TwelveFactorTierC} from "../custom/12factor/tierC";

/**
 * This will identify directories containing any of the following files as virtual projects
 * if the repository root didn't look like a virtual project.
 */
export const virtualProjectFinder: VirtualProjectFinder = cachingVirtualProjectFinder(
    fileNamesVirtualProjectFinder(
        "package.json", "pom.xml", "build.gradle", "requirements.txt",
    ));

/**
 * The aspects managed by this SDM.
 * Modify this list to customize with your own aspects.
 */
export function aspects(): Aspect[] {
    return [
        DockerFrom,
        DockerfilePath,
        DockerPorts,
        License,
        // Based on license, decide the presence of a license: Not spread
        LicensePresence,
        SpringBootStarter,
        TypeScriptVersion,
        new CodeOwnership(),
        NpmDependencies,
        CodeOfConduct,
        ExposedSecrets,
        TravisScriptsAspect,
        branchCount,
        GitRecency,
        HasEnvFiles,
        // This is expensive as it requires deeper cloning
        // gitActiveCommitters(30),
        // This is also expensive
        CodeMetricsAspect,
        // StackAspect,
        // CiAspect,
        // JavaBuild,
        // Don't show these
        globAspect({ name: "csproject", displayName: undefined, glob: "*.csproj" }),
        globAspect({ name: "snyk", displayName: undefined, glob: ".snyk" }),
        ChangelogAspect,
        ContributingAspect,
        globAspect({ name: "azure-pipelines", displayName: "Azure pipeline", glob: "azure-pipelines.yml" }),
        globAspect({ name: "readme", displayName: "Readme file", glob: "README.md" }),
        CsProjectTargetFrameworks,
        SpringBootVersion,
        // allMavenDependenciesAspect,    // This is expensive
        DirectMavenDependencies,
        PythonDependencies,
        K8sSpecs,
        LeinDeps,
        TwelveFactorTierC,
        TwelveFactorTierB,
        TwelveFactorTierA,
        TwelveFactor,
    ].map(aspect => makeVirtualProjectAware(aspect, virtualProjectFinder));
}
