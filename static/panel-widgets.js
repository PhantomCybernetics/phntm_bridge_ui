let panel_widgets = {
    'sensor_msgs/msg/BatteryState' : { widget: BatteryStateWidget, w:4, h:2 } ,
    'sensor_msgs/msg/Range' : { widget: RangeWidget, w:2, h:2 },
    'sensor_msgs/msg/LaserScan' : { widget: LaserScanWidget, w:4, h:4 },
    'rcl_interfaces/msg/Log' : { widget: LogWidget, w:8, h:2 },
    'sensor_msgs/msg/Image' : { widget: null, w:4, h:4 },
    'sensor_msgs/msg/Imu' : { widget: ImuWidget, w:2, h:2 },
}

// BATTERY VISUALIZATION
function BatteryStateWidget(panel, decoded) {

    let minVoltage = 3.2*3;
    let maxVoltage = 4.2*3;

    panel.chart_trace.push({
        x: decoded.header.stamp.nanosec / 1e9 + decoded.header.stamp.sec,
        y: decoded.voltage
    });

    if (panel.chart_trace.length > panel.max_trace_length) {
        panel.chart_trace.shift();
    }

    let width = $('#panel_widget_'+panel.n).width();
    let height = $('#panel_widget_'+panel.n).parent().innerHeight()-30;

    let options = {
        series: [],
        chart: {
            height: height,
            width: width,
            type: 'line',
            zoom: {
                enabled: false
            },
            animations: {
                //enabled: false,
                dynamicAnimation: {
                    enabled: false
                }
            },
        },
        dataLabels: {
            enabled: false
        },
        stroke: {
            curve: 'straight'
        },
        // title: {
        //     text: 'Voltage over time',
        //     align: 'left'
        // },
        grid: {
            row: {
                colors: ['#f3f3f3', 'transparent'], // takes an array which will be repeated on columns
                opacity: 0.5
            },
        },
        xaxis: {
            //categories: panel.labels_trace,
            tickAmount: 10,
            decimalsInFloat: 5,
            labels: {
                show: false,
            }
        },
        yaxis: {
            min: minVoltage-0.2,
            max: maxVoltage+0.2,
            decimalsInFloat: 2,
            labels: {
                formatter: function (value) {
                  return value.toFixed(2) + " V";
                }
            },
        },
        annotations: {
            yaxis: [

            ]
          }
    };

    if (maxVoltage > 0) {
        options.annotations.yaxis.push({
            y: maxVoltage,
            borderColor: '#00E396',
            label: {
                borderColor: '#00E396',
                style: {
                color: '#fff',
                background: '#00E396'
                },
                text: 'Full'
            }
            });
    }
    if (minVoltage > 0) {
        options.annotations.yaxis.push({
            y: minVoltage,
            borderColor: '#ff0000',
            label: {
                borderColor: '#ff0000',
                style: {
                color: '#fff',
                background: '#ff0000'
                },
                text: 'Empty'
            }
        });
    }

    if (!panel.chart) {
        $('#panel_widget_'+panel.n).addClass('enabled battery');

        //const div = d3.selectAll();
        //console.log('d3 div', div)

        panel.chart = new ApexCharts(document.querySelector('#panel_widget_'+panel.n), options);
        panel.chart.render();
    }


    options.series = [{
            name: 'Voltage',
            data: panel.chart_trace
        }];
    panel.chart.updateOptions(options);

    // panel.chart.updateSeries([{
    //     name: 'Voltage',
    //     data: panel.chart_trace
    // }]);

}


// RANGE VISUALIZATION
function RangeWidget(panel, decoded) {

    panel.chart_trace = [ decoded.range > decoded.max_range ? -1 : decoded.range ];

    //let fullScale = decoded.max_range;
    let gageVal = 100.0 - (Math.min(Math.max(decoded.range, 0), decoded.max_range) * 100.0 / decoded.max_range);

    let width = $('#panel_widget_'+panel.n).width();
    let height = $('#panel_widget_'+panel.n).height();
    let mt = parseFloat($('#panel_widget_'+panel.n).css('margin-top'));
    let mb = parseFloat($('#panel_widget_'+panel.n).css('margin-bottom'));
    //height = height - mt - mb;
    let c = lerpColor('#259FFB', '#ff0000', gageVal / 100.0);

    let options = {
        chart: {
            height: '100%',
            width: '100%',
            type: "radialBar",
            offsetY: 10,
            redrawOnParentResize: true,
        },
        series: [ 0 ],
        colors: [ c ],

        plotOptions: {
            radialBar: {
            hollow: {
                margin: 15,
                size: "70%"
            },
            track: {
                show: true,

            },

            startAngle: -135,
            endAngle: 135,
            dataLabels: {
                showOn: "always",
                name: {
                    offsetY: -10,
                    show: true,
                    color: "#888",
                    fontSize: "13px"
                },
                value: {
                    color: "#111",
                    fontSize: "20px",
                    show: true,
                    formatter: function(val) {
                        //console.log(panel.chart_trace);
                        if (panel.chart_trace[0] < 0)
                            return "> "+decoded.max_range.toFixed(1) +" m";
                        else
                            return panel.chart_trace[0].toFixed(3) + " m";
                    }
                }
            }
            }
        },

        stroke: {
            lineCap: "round",
        },
        labels: ["Distance"]
    };

    if (!panel.chart) {
        $('#panel_widget_'+panel.n).addClass('enabled range');

        //const div = d3.selectAll();
        //console.log('d3 div', div)
        panel.chart = new ApexCharts(document.querySelector('#panel_widget_'+panel.n), options);

        panel.chart.render();
    }

    //console.log('updating range '+panel.topic+' w w='+width+'; h='+height);
    options.series = [ gageVal ];
    panel.chart.updateOptions(options);
    // this.chart.updateSeries([
    //     100.0 - gageVal
    // ]);


}

//laser scan visualization
function LaserScanWidget(panel, decoded) {

    if (!panel.chart) {
        panel.max_trace_length = 5;
        $('#panel_widget_'+panel.n).addClass('enabled laser_scan');
        [ panel.widget_width, panel.widget_height ] = GetAvailableWidgetSize(panel)
        const canvas = $('#panel_widget_'+panel.n).html('<canvas width="'+panel.widget_width +'" height="'+panel.widget_height+'"></canvas>').find('canvas')[0];
        const ctx = canvas.getContext("2d");
        panel.chart = ctx;

        //const div = d3.selectAll();
        //console.log('d3 div', div)
        //panel.chart = new ApexCharts(document.querySelector('#panel_widget_'+panel.n), options);

        //panel.chart.render();
        panel.zoom = 8.0;

        //zoom menu control
        $('<div class="menu_line zoom_ctrl" id="zoom_ctrl_'+panel.n+'"><span class="minus">-</span><span class="val">Zoom: '+panel.zoom.toFixed(1)+'x</span><span class="plus">+</span></div>').insertAfter($('#panel_msg_types_'+panel.n).parent());
        $('#zoom_ctrl_'+panel.n+' .plus').click(function(ev) {
            panel.zoom +=1.0;
            $('#zoom_ctrl_'+panel.n+' .val').html('Zoom: '+panel.zoom.toFixed(1)+'x');
        });
        $('#zoom_ctrl_'+panel.n+' .minus').click(function(ev) {
            if (panel.zoom - 1.0 <= 0) {
                return;
            }
            panel.zoom -= 1.0;
            $('#zoom_ctrl_'+panel.n+' .val').html('Zoom: '+panel.zoom.toFixed(1)+'x');
        });


        window.addEventListener('resize', () => {
            ResizeWidget(panel);
            RenderScan(panel);
        });
        $('#display_panel_source_'+panel.n).change(() => {
            ResizeWidget(panel);
            RenderScan(panel);
        });
        panel.resize_event_handler = function () {
            console.log('laser resized');
            ResizeWidget(panel);
            RenderScan(panel);
        };
    }



    //console.log('widget', [panel.widget_width, panel.widget_height], frame);

    let numSamples = decoded.ranges.length;
    let anglePerSample = 360.0 / numSamples;

    //panel.chart.fillStyle = "#ff0000";

    let scale = (panel.widget_height/2.0 - 20.0) / decoded.range_max;

    let newScanPts = [];
    for (let i = 0; i < numSamples; i++) {

        if (decoded.ranges[i] == null || decoded.ranges[i] > decoded.range_max || decoded.ranges[i] < decoded.range_min)
            continue;

        let pos = [
            0,
            decoded.ranges[i] * scale
        ]

        let arad = deg2rad(anglePerSample * i);
        let p = [
            Math.cos(arad)*pos[0] - Math.sin(arad)*pos[1],
            Math.sin(arad)*pos[0] + Math.cos(arad)*pos[1]
        ]

        newScanPts.push(p);
    }

    panel.chart_trace.push(newScanPts);

    if (panel.chart_trace.length > panel.max_trace_length) {
        panel.chart_trace.shift();
    }

    panel.range_max = decoded.range_max; //save for later
    panel.scale = scale;

    RenderScan(panel);
}

function ImuWidget(panel, decoded) {

    if (!panel.chart) {

        $('#panel_widget_'+panel.n).addClass('enabled imu');
        // let q = decoded.orientation;
        [ panel.widget_width, panel.widget_height ] = GetAvailableWidgetSize(panel)

        panel.scene = new THREE.Scene();
        panel.camera = new THREE.PerspectiveCamera( 75, panel.widget_width / panel.widget_height, 0.1, 1000 );

        panel.renderer = new THREE.WebGLRenderer();
        panel.renderer.setSize( panel.widget_width, panel.widget_height );
        document.getElementById('panel_widget_'+panel.n).appendChild( panel.renderer.domElement );

        const geometry = new THREE.BoxGeometry( 1, 1, 1 );
        const material = new THREE.MeshStandardMaterial( { color: 0x00ff00 } );
        panel.cube = new THREE.Mesh( geometry, material );
        panel.scene.add( panel.cube );
        panel.cube.position.y = .5

        panel.cube.add(panel.camera)
        panel.camera.position.z = 2;
        panel.camera.position.x = 0;
        panel.camera.position.y = 1;
        panel.camera.lookAt(panel.cube.position);

        // const light = new THREE.AmbientLight( 0x404040 ); // soft white light
        // panel.scene.add( light );

        const directionalLight = new THREE.DirectionalLight( 0xffffff, 0.5 );
        panel.scene.add( directionalLight );
        directionalLight.position.set( 1, 2, 1 );
        directionalLight.lookAt(panel.cube.position);

        // const axesHelper = new THREE.AxesHelper( 5 );
        // panel.scene.add( axesHelper );

        const axesHelperCube = new THREE.AxesHelper( 5 );
        axesHelperCube.scale.set(1, 1, 1); //show z forward like in ROS
        panel.cube.add( axesHelperCube );

        const gridHelper = new THREE.GridHelper( 10, 10 );
        panel.scene.add( gridHelper );

        panel.chart = panel.renderer;

        // panel.animate();

        window.addEventListener('resize', () => {
            ResizeWidget(panel);
            RenderImu(panel);
        });
        $('#display_panel_source_'+panel.n).change(() => {
            ResizeWidget(panel);
            RenderImu(panel);
        });
        panel.resize_event_handler = function () {
            ResizeWidget(panel);
            RenderImu(panel);
        };
    }

    // LHS (ROS) => RHS (Three)
    panel.cube.quaternion.set(-decoded.orientation.y, decoded.orientation.z, -decoded.orientation.x, decoded.orientation.w);

    RenderImu(panel)
}
function RenderImu(panel) {

    panel.renderer.render( panel.scene, panel.camera );
}



function ScrollSmoothlyToBottom (el) {
    return el.animate({
        scrollTop: el.prop("scrollHeight")
    }, 500);
}

function LogWidget(panel, decoded) {

    if (!$('#panel_widget_'+panel.n).hasClass('enabled')) {
        $('#panel_widget_'+panel.n).addClass('enabled log');
    }

    let line = '<div class="log_line">[<span class="name">'+decoded.name+'</span>] <span class="time">'+decoded.stamp.sec+'.'+decoded.stamp.nanosec+'</span>: '+decoded.msg+'</div>';
    $('#panel_widget_'+panel.n).append(line);

    if (panel.animation != null && panel.animation != undefined && !panel.animation.pla) {
        //console.log('cancel animation ', panel.animation)
        panel.animation.stop();
    }

    panel.animation = ScrollSmoothlyToBottom($('#panel_widget_'+panel.n));

    // panel.chart_trace.push({
    //     x: decoded.header.stamp.nanosec / 1e9 + decoded.header.stamp.sec,
    //     y: decoded.voltage
    // });

    // if (panel.chart_trace.length > panel.max_trace_length) {
    //     panel.chart_trace.shift();
    // }
}

function GetAvailableWidgetSize(panel) {

    let sourceDisplayed = $('#panel_content_'+panel.n).hasClass('enabled');

    let w = $('#panel_widget_'+panel.n).width();
    //console.log('w', w, $('#panel_content_'+panel.n).innerWidth())
    //if (sourceDisplayed)
    //    w -= $('#panel_content_'+panel.n).innerWidth();

    let h = $('#panel_widget_'+panel.n).innerHeight();
    //h = Math.min(h, w);
    //h = Math.min(h, 500);

    return [w, h];
}

function ResizeWidget (panel) {
    [ panel.widget_width, panel.widget_height ] = GetAvailableWidgetSize(panel)
    $('#panel_widget_'+panel.n+' CANVAS')
        .attr('width', panel.widget_width)
        .attr('height', panel.widget_height)
    ;
    if (panel.renderer) {

        panel.camera.aspect = parseFloat(panel.widget_width) / parseFloat(panel.widget_height);
        panel.camera.updateProjectionMatrix();

        panel.renderer.setSize( panel.widget_width, panel.widget_height );
        console.log('resize', panel.widget_width, panel.widget_height)
    }

}

function RenderScan(panel) {

    let frame = [
        panel.widget_width/2.0,
        panel.widget_height/2.0
    ];


    let range = panel.range_max;

    //panel.chart.fillStyle = "#fff";
    panel.chart.clearRect(0, 0, panel.widget_width, panel.widget_height);

    for (let i = 0; i < panel.chart_trace.length; i++) {
        let pts = panel.chart_trace[i];

        for (let j = 0; j < pts.length; j++) {
            let p = [ pts[j][0]*panel.zoom, pts[j][1]*panel.zoom ]; //zoom applied here
            panel.chart.fillStyle = (i == panel.chart_trace.length-1 ? "#ff0000" : "#aa0000");
            panel.chart.beginPath();
            panel.chart.arc(frame[0]+p[0], frame[1]-p[1], 1.5, 0, 2 * Math.PI);
            panel.chart.fill();
        }
    }

    //lines
    let range_int = Math.floor(range);
    for (let x = -range_int; x < range_int+1; x++) {
        panel.chart.beginPath();
        panel.chart.setLineDash(x == 0 ? [] : [panel.scale/20, panel.scale/10]);
        panel.chart.strokeStyle = x == 0 ? 'rgba(100,100,100,0.3)' : '#0c315480' ;

        //vertical
        //panel.widget_height
        let dd = Math.sqrt(Math.pow(range_int*panel.scale, 2) - Math.pow(x*panel.scale, 2))*panel.zoom;
        panel.chart.moveTo(frame[0] + (x*panel.scale)*panel.zoom, frame[1]-dd);
        panel.chart.lineTo(frame[0] + (x*panel.scale)*panel.zoom, frame[1]+dd);
        panel.chart.stroke();

        //horizontal
        panel.chart.moveTo(frame[0]-dd, frame[1]+(x*panel.scale)*panel.zoom);
        panel.chart.lineTo(frame[0]+dd, frame[1]+(x*panel.scale)*panel.zoom);
        panel.chart.stroke();
    }

    //frame dot on top
    panel.chart.fillStyle = "#26a0fc";
    panel.chart.beginPath();
    panel.chart.arc(frame[0], frame[1], 5, 0, 2 * Math.PI);
    panel.chart.fill();
}



function deg2rad(degrees)
{
  var pi = Math.PI;
  return degrees * (pi/180);
}