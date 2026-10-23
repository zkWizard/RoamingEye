// 3d-tiles-renderer 0.5.3 exports TerrariumMeshPlugin but ships no typings for it.
import "3d-tiles-renderer/plugins";

declare module "3d-tiles-renderer/plugins" {
  export class TerrariumMeshPlugin {
    constructor(options?: {
      url?: string;
      maxZoom?: number;
      heightScale?: number;
    });
  }
}
