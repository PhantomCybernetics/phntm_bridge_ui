import * as THREE from "three";
import { lerpColor } from "../../inc/lib.js";
import { WorldModel3DPuginBase } from "./world-model-plugin-base.js";

export class WorldModel3DWidget_Range extends WorldModel3DPuginBase {

    static SOURCE_TOPIC_TYPE = 'sensor_msgs/msg/Range';
    static SOURCE_DESCRIPTION = 'Range source';
    static SOURCE_DEFAULT_TOPIC = null;
    static SOURCE_MAX_NUM = -1;

    constructor(world_model) {
        super(world_model);
    }

    // on range data
    onTopicData(topic, msg) {
        if (!this.world_model.robot_model || this.world_model.panel.paused) return;

        if (!this.overlays[topic].visual) {
            let frame_id = msg.header.frame_id;
            let f = this.world_model.robot_model.getFrame(frame_id);
            if (!f) {
                let err = 'Frame "' + frame_id + '" not found in robot model for range data from ' + topic;
                this.ui.showNotification(err, "error");
                console.error(err);
                return;
            }

            let a_tan = Math.tan(msg.field_of_view / 2.0);
            let r = a_tan * msg.max_range * 2.0;
            const geometry = new THREE.ConeGeometry(r, msg.max_range, 32);
            geometry.rotateZ((90 * Math.PI) / 180);
            geometry.translate(msg.max_range / 2.0, 0, 0);
            let color = new THREE.Color(0xffff00);
            const material = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.85,
            });
            const cone = new THREE.Mesh(geometry, material);
            cone.castShadow = false;
            cone.renderOrder = 2;
            this.overlays[topic].visual = {
                cone: cone,
                color: color,
                material: material,
            };
            f.add(cone);
        }

        let gageVal = (Math.min(Math.max(msg.range, 0), msg.max_range) * 100.0) / msg.max_range;
        gageVal = gageVal / 100.0;
        let color = null;
        if (gageVal < 0.5) color = lerpColor("#ff0000", "#2696FB", gageVal * 2.0);
        else color = lerpColor("#2696FB", "#ffffff", (gageVal - 0.5) * 2.0);

        if (msg.range < msg.max_range - 0.001) {
            this.overlays[topic].visual.material.color.set(color);
            this.overlays[topic].visual.material.opacity = Math.max(0.99 - gageVal, 0.2);
            this.overlays[topic].visual.cone.scale.set(gageVal, gageVal, gageVal);
        } else {
            this.overlays[topic].visual.cone.scale.set(0, 0, 0);
        }

        this.world_model.renderDirty();
    }

    // render ranges
    onRender() {
        // nothing to fo here
    }

    clearVisuals(topic) {
        if (this.overlays[topic].visual) {
		    this.overlays[topic].visual.cone.removeFromParent();
			delete this.overlays[topic].visual;
		}
    }
}