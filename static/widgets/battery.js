// BATTERY VISUALIZATION
export class BatteryStateWidget {

    constructor(panel, topic) {
        this.panel = panel;
        this.topic = topic;

        this.minVoltage = 3.2*3; //todo load from robot
        this.maxVoltage = 4.2*3;

        $('#panel_widget_'+panel.n).addClass('enabled battery');

        let options = {
            series: [ ],
            chart: {
                height: '100%',
                width: '100%',
                type: 'line',
                parentHeightOffset: 0,
                zoom: {
                    enabled: false
                },
                animations: {
                    enabled: false,
                    dynamicAnimation: {
                        enabled: false
                    }
                },
                selection: {
                    enabled: false
                },
                redrawOnParentResize: true,

            },
            stroke: {
                curve: 'straight',
            },
            grid: {
                row: {
                    colors: ['#f3f3f3', 'transparent'], // takes an array which will be repeated on columns
                    opacity: 0.5
                },
            },
            xaxis: {
                labels: {
                    show: false,
                }
            },
            yaxis: {
                min: this.minVoltage-0.2,
                max: this.maxVoltage+0.2,
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
            },
            tooltip: {
                enabled: false,
            }
        };

        if (this.maxVoltage > 0) {
            options.annotations.yaxis.push({
                y: this.maxVoltage,
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
        if (this.minVoltage > 0) {
            options.annotations.yaxis.push({
                y: this.minVoltage,
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

        this.chart = new ApexCharts(document.querySelector('#panel_widget_'+panel.n), options);
        this.chart.render();
        this.data_trace = [];

        panel.ui.client.on(this.topic, this.onData);
        // panel.resize_event_handler = function () { }; //no need here
    }

    onClose() {
        console.warn('Closing battery widget')
        this.panel.ui.client.off(this.topic, this.onData);
    }

    onData = (decoded) => {
        this.data_trace.push({
            x: decoded.header.stamp.nanosec / 1e9 + decoded.header.stamp.sec,
            y: decoded.voltage
        });

        if (this.data_trace.length > this.panel.max_trace_length) {
            this.data_trace.shift();
        }

        if (this.chart) {
            this.chart.updateSeries([ { data: this.data_trace } ], false); //don't animate
        }
    }
}