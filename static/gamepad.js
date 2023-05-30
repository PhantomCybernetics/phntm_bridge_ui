let idGamepad = null;

$(document ).ready(function() {

    $('#gamepad_status').click(() => {
        console.log('click');
        if ($('#gamepad').hasClass('debug_on')) {
            $('#gamepad').removeClass('debug_on');
        } else {
            $('#gamepad').addClass('debug_on');
        }
    });

});

const gamepad_mapping = {
    buttons: {
        'dead_man_switch': [ 8, 5 ], //browser => joy2twist
        'fast_mode': [ 4, 3 ],
        'slow_mode': [ 1, 1 ],
    },
    axes: {
        'angular_z_axis': [ 1, 0 ], //speed => fw back
        'linear_x_axis': [ 0, 1 ], //turn l/r
        'linear_y_axis': [ 2, 4 ] //strafe
    }
}

window.addEventListener('gamepadconnected', (event) => {
    console.warn('Gamepad connected:', event.gamepad);
    idGamepad = event.gamepad.index;

    $('#gamepad').addClass('connected');

    GamepadLoop();
});

window.addEventListener('gamepaddisconnected', (event) => {
    if (idGamepad == event.gamepad.index) {
        idGamepad = null;
        console.warn('Gamepad disconnected:', event.gamepad);
        $('#gamepad').removeClass('connected');
    }
});


function GamepadLoop() {
    if (idGamepad == null)
        return;

    const gp = navigator.getGamepads()[idGamepad];

    let buttons = gp.buttons;
    let axes = gp.axes;

    let state = {
        dead_man_switch: buttons[gamepad_mapping.buttons['dead_man_switch'][0]].pressed,
        fast_mode: buttons[gamepad_mapping.buttons['fast_mode'][0]].pressed,
        slow_mode: buttons[gamepad_mapping.buttons['slow_mode'][0]].pressed,

        angular_z_axis: axes[gamepad_mapping.axes['angular_z_axis'][0]],
        linear_x_axis: axes[gamepad_mapping.axes['linear_x_axis'][0]],
        linear_y_axis: axes[gamepad_mapping.axes['linear_y_axis'][0]]
    }

    if (state.dead_man_switch)
        $('#gamepad_status').addClass('active')
    else
        $('#gamepad_status').removeClass('active')

    let debug = {
        buttons: {},
        axis: {}
    }

    for (let i = 0; i < buttons.length; i++) {
        let b = buttons[i];
        debug.buttons[i] = b.pressed;
    }

    for (let i = 0; i < axes.length; i++) {
        let a = axes[i];
        debug.axis[i] = a;
    }
    //console.log(buttons, axes)

    $('#gamepad_debug').html(
        JSON.stringify(state, null, 2)
        //+ '<br>' + JSON.stringify(debug, null, 2)
    );

    requestAnimationFrame(GamepadLoop);
}