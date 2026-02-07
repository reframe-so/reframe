import { serve as hypervisorServe, type Defaults } from "@reframe/aether/xx-stage/hypervisor.ts";
import { serve as aetherServe } from "@reframe/aether/xx-stage/aether.ts";
import { bundler } from "@reframe/aether/xx-stage/serve.ts";

export type { Defaults };

export async function serve(defaults?: Defaults) {
  console.log("[cli] starting serve (hypervisor + aether)");
  await Promise.all([
    hypervisorServe(defaults),
    aetherServe(),
  ]);
  await bundler.stop();
}

export async function hypervisor(defaults?: Defaults) {
  console.log("[cli] starting hypervisor");
  await hypervisorServe(defaults);
}

export async function aether() {
  console.log("[cli] starting aether");
  await aetherServe();
}
