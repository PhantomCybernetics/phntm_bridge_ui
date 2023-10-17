export function JoyDriver (gamepad, axes, buttons) {
    let now_ms = Date.now(); //window.performance.now()
    let sec = Math.floor(now_ms / 1000)
    let nanosec = (now_ms - sec*1000) * 1000000

    // sensor_msgs/msg/Joy
    let msg = {
        header: {
            stamp: {
                sec: sec,
                nanosec: nanosec
            },
            frame_id: 'gamepad'
        },
        axes: [],
        buttons: []
    }

    for (let id_axis = 0; id_axis < axes.length; id_axis++) {
        let val = gamepad.apply_axis_deadzone(axes[id_axis], id_axis)
        msg.axes[id_axis] = val
    }

    for (let id_btn = 0; id_btn < buttons.length; id_btn++) {
        msg.buttons[id_btn] = buttons[id_btn].pressed;
    }

    return msg;
}

export function TwistMecanumDriver (gamepad, axes, buttons) {
    let fw_speed = gamepad.apply_axis_deadzone(axes[1], 1); // (-1,1)
    // console.log('fw_speed, raw=', axes[1], fw_speed, this.axes_config[1])

    let val_strife = 0.0;
    let val_strife_l = gamepad.apply_axis_deadzone(axes[4], 4)
    if (val_strife_l > -1) {
        val_strife -= (val_strife_l + 1.0) / 4.0; // (-.5,0)
    }
    let val_strife_r = gamepad.apply_axis_deadzone(axes[3], 3)
    if (val_strife_r > -1) {
        val_strife += (val_strife_r + 1.0) / 4.0; // (0,.5)
    }
    let turn_amount = gamepad.apply_axis_deadzone(-axes[2], 2); // (-1,1)
    let turn_speed_max = 2.0; //at 0.0 fw speed
    let turn_speed_min = 0.7; //at 1.0 fw speed
    let turn_speed = gamepad.lerp(turn_speed_max, turn_speed_min, Math.abs(fw_speed))

    // geometry_msgs/msg/Twist
    let msg = {
            "linear": {
                "x": fw_speed, //fw / back (-1,1)
                "y": val_strife, //strife (-.5,0.5)
                "z": 0
            },
            "angular": {
                "x": 0,
                "y": 0,
                "z": turn_amount * turn_speed, //turn (-3,3)
            }
    }



    return msg;
}