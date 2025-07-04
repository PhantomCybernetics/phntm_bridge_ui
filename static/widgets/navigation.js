import { lerpColor, linkifyURLs, lerp, deg2rad } from "../inc/lib.js";
import * as THREE from "three";
import { Zoomable2DTiles } from "./inc/zoomable-2d-tiles.js";

export class NavigationWidget extends Zoomable2DTiles {
	static label = "Lidar SLAM + Navigation (2D)";
}
