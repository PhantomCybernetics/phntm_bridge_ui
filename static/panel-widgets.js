let panel_widgets = {
    'sensor_msgs/msg/BatteryState' : BatteryStateWidget,
    'sensor_msgs/msg/Range' : RangeWidget,
    'sensor_msgs/msg/LaserScan' : LaserScanWidget,
    'rcl_interfaces/msg/Log' : LogWidget,
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

    if (!panel.chart) {
        $('#panel_widget_'+panel.n).addClass('enabled');

        //const div = d3.selectAll();
        //console.log('d3 div', div)

        let width = $('#panel_widget_'+panel.n).width();
        let height = $('#panel_content_'+panel.n).innerHeight();

        let options = {
            series: [],
            chart: {
                height: height,
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


        panel.chart = new ApexCharts(document.querySelector('#panel_widget_'+panel.n), options);
        panel.chart.render();
    }

    panel.chart.updateSeries([{
        name: 'Voltage',
        data: panel.chart_trace
    }]);

}


// RANGE VISUALIZATION
function RangeWidget(panel, decoded) {

    panel.chart_trace = [ decoded.range > decoded.max_range ? -1 : decoded.range ];

    //let fullScale = decoded.max_range;
    let gageVal = 100.0 - (Math.min(Math.max(decoded.range, 0), decoded.max_range) * 100.0 / decoded.max_range);

    let width = $('#panel_widget_'+panel.n).width();
    let height = $('#panel_content_'+panel.n).innerHeight();

    let c = lerpColor('#259FFB', '#ff0000', gageVal / 100.0);

    let options = {
        chart: {
            height: height,
            type: "radialBar"
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
                    fontSize: "30px",
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
        $('#panel_widget_'+panel.n).addClass('enabled');

        //const div = d3.selectAll();
        //console.log('d3 div', div)
        panel.chart = new ApexCharts(document.querySelector('#panel_widget_'+panel.n), options);

        panel.chart.render();
    }

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

        window.addEventListener('resize', () => {
            ResizeWidget(panel);
            RenderScan(panel);
        });
        $('#display_panel_source_'+panel.n).change(() => {
            ResizeWidget(panel);
            RenderScan(panel);
        });
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

const ScrollSmoothlyToBottom = (el) => {
    el.animate({
        scrollTop: el.prop("scrollHeight")
    }, 500);
}

function LogWidget(panel, decoded) {

    if (!$('#panel_widget_'+panel.n).hasClass('enabled')) {
        $('#panel_widget_'+panel.n).addClass('enabled log');
    }

    let line = '<div class="log_line">[<span class="name">'+decoded.name+'</span>] <span class="time">'+decoded.stamp.sec+'.'+decoded.stamp.nanosec+'</span>: '+decoded.msg+'</div>';
    $('#panel_widget_'+panel.n).append(line);

    ScrollSmoothlyToBottom($('#panel_widget_'+panel.n));

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

    let h = $('#panel_content_'+panel.n).innerHeight();
    h = Math.min(h, w);
    h = Math.min(h, 500);

    return [w, h];
}

function ResizeWidget (panel) {
    [ panel.widget_width, panel.widget_height ] = GetAvailableWidgetSize(panel)
    $('#panel_widget_'+panel.n+' CANVAS')
        .attr('width', panel.widget_width)
        .attr('height', panel.widget_height)
    ;
}

function RenderScan(panel) {

    let frame = [
        panel.widget_width/2.0,
        panel.widget_height/2.0
    ];

    //panel.chart.fillStyle = "#fff";
    panel.chart.clearRect(0, 0, panel.widget_width, panel.widget_height);

    for (let i = 0; i < panel.chart_trace.length; i++) {
        let pts = panel.chart_trace[i];

        for (let j = 0; j < pts.length; j++) {
            let = p = pts[j];
            panel.chart.fillStyle = (i == panel.chart_trace.length-1 ? "#ff0000" : "#aa0000");
            panel.chart.beginPath();
            panel.chart.arc(frame[0]+p[0], frame[1]+p[1], 1.5, 0, 2 * Math.PI);
            panel.chart.fill();
        }
    }

    //lines
    let range_int = Math.floor(panel.range_max);
    for (let x = -range_int; x < range_int+1; x++) {
        panel.chart.beginPath();
        panel.chart.setLineDash(x == 0 ? [] : [panel.scale/20, panel.scale/10]);
        panel.chart.strokeStyle = x == 0 ? 'rgba(100,100,100,0.3)' : '#0c315480' ;

        //vertical
        //panel.widget_height
        let dd = Math.sqrt(Math.pow(range_int*panel.scale, 2) - Math.pow(x*panel.scale, 2));
        panel.chart.moveTo(frame[0]+(x*panel.scale), frame[1]-dd);
        panel.chart.lineTo(frame[0]+(x*panel.scale), frame[1]+dd);
        panel.chart.stroke();

        //horizontal
        panel.chart.moveTo(frame[0]-dd, frame[1]+(x*panel.scale));
        panel.chart.lineTo(frame[0]+dd, frame[1]+(x*panel.scale));
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