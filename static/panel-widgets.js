let widgets = {
    'sensor_msgs/msg/BatteryState' : BatteryStateWidget,
    'sensor_msgs/msg/Range' : RangeWidget,
    'sensor_msgs/msg/LaserScan' : LaserScanWidget,
}


// BATTERY VISUALIZATION
function BatteryStateWidget(panel, decoded) {

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
                decimalsInFloat: 2,
                labels: {
                    formatter: function (value) {
                      return value.toFixed(2) + " V";
                    }
                },
            }
        };

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

function LaserScanWidget(panel, decoded) {


    if (!panel.chart) {
        panel.max_trace_length = 5;
        $('#panel_widget_'+panel.n).addClass('enabled');

        panel.widget_width = $('#panel_widget_'+panel.n).width();
        panel.widget_height = $('#panel_content_'+panel.n).innerHeight();
        panel.widget_height = Math.min(panel.widget_height, panel.widget_width);

        const canvas = $('#panel_widget_'+panel.n).html('<canvas width="'+panel.widget_width +'" height="'+panel.widget_height+'"></canvas>').find('canvas')[0];
        const ctx = canvas.getContext("2d");
        panel.chart = ctx;

        //const div = d3.selectAll();
        //console.log('d3 div', div)
        //panel.chart = new ApexCharts(document.querySelector('#panel_widget_'+panel.n), options);

        //panel.chart.render();
    }

    panel.chart.fillStyle = "#ffffff";
    panel.chart.fillRect(0, 0, panel.widget_width, panel.widget_height);

    let frame = [
        panel.widget_width/2.0,
        panel.widget_height/2.0
    ];

    panel.chart.fillStyle = "#259FFB";
    panel.chart.beginPath();
    panel.chart.arc(frame[0], frame[1], 3, 0, 2 * Math.PI);
    panel.chart.fill();

    let numSamples = decoded.ranges.length;
    let anglePerSample = 360.0 / numSamples;

    //panel.chart.fillStyle = "#ff0000";

    let newScanPts = [];
    for (let i = 0; i < numSamples; i++) {

        if (decoded.ranges[i] == null || decoded.ranges[i] > decoded.range_max || decoded.ranges[i] < decoded.range_min)
            continue;

        let pos = [
            0,
            decoded.ranges[i] * (decoded.range_max / (panel.widget_height/2.0)-20.0)
        ]

        let arad = deg2rad(anglePerSample * i);
        let p = [
            Math.cos(arad)*pos[0] - Math.sin(arad)*pos[1],
            Math.sin(arad)*pos[0] + Math.cos(arad)*pos[1]
        ]



        newScanPts.push(p);

        //console.log('pos', pos, 'p', p);
    }

    panel.chart_trace.push(newScanPts);

    if (panel.chart_trace.length > panel.max_trace_length) {
        panel.chart_trace.shift();
    }

    for (let i = 0; i < panel.chart_trace.length; i++) {
        let pts = panel.chart_trace[i];

        panel.chart.fillStyle = i == panel.chart_trace.length-1 ? "#ff0000" : "#000000";

        for (let j = 0; j < pts.length; j++) {
            let = p = pts[j];

            panel.chart.beginPath();
            panel.chart.arc(frame[0]+p[0], frame[1]+p[1], 1.5, 0, 2 * Math.PI);
            panel.chart.fill();
        }
    }



}

function deg2rad(degrees)
{
  var pi = Math.PI;
  return degrees * (pi/180);
}