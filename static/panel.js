let panelNo = 0;


class Panel {
    topic = null;
    msg_types = [];
    n = ++panelNo;
    msg_type = null;
    msg_reader = null;
    max_height = 0;

    chart = null;
    chart_trace = [];
    max_trace_length = 100;

    initiated = false;

    constructor(topic, msg_types) {
        this.topic = topic;
        console.log('Panel created for '+this.topic)

        $('#monitors').append(
            '<div class="monitor_panel" data-topic="'+topic+'">' +
            '<h3>'+topic+'</h3>' +
            '<a href="#" id="panel_msg_types_'+this.n+'" class="msg_types" title="Toggle message type definition"></a>' +
            '<input type="checkbox" id="update_panel_'+this.n+'" class="panel_update" checked title="Update"/>' +
            '<div class="panel_widget" id="panel_widget_'+this.n+'"></div>' +
            '<div class="panel_content" id="panel_content_'+this.n+'">Waiting for data...</div>' +
            '<div class="cleaner"></div>' +
            '<div class="panel_msg_type" id="panel_msg_type_'+this.n+'"></div>' +
            '</div>'
        );

        let that = this;
        $('#panel_msg_types_'+this.n).click(function(ev) {
            console.log('click '+that.n)
            let el = $('#panel_msg_type_'+that.n);
            if (el.css('display') != 'block')
                el.css('display', 'block');
            else if (!el.hasClass('err'))
                el.css('display', 'none');
            ev.cancelBubble = true;
            ev.preventDefault();
        });

        if (msg_types)
            this.Init(msg_types)
    }

    Init(msg_types) {

        if (this.initiated)
            return;
        this.initiated = true;

        this.msg_types = msg_types;
        this.msg_type = msg_types ? FindMessageType(msg_types[0], supported_msg_types) : null;
        $('#panel_msg_types_'+this.n).html(msg_types ? msg_types.join(', ') : '');
        $('#panel_msg_type_'+this.n).html((this.msg_type ? JSON.stringify(this.msg_type, null, 2) : 'Message type not loaded!'));

        if (this.msg_type == null && msg_types != null)
            $('#panel_msg_type_'+this.n).addClass('err');

        if (this.msg_type != null) {
            let Reader = window.Serialization.MessageReader;
            this.msg_reader = new Reader( [ this.msg_type ].concat(supported_msg_types) );
        }
    }


    OnData(ev) {

        let rawData = ev.data; //arraybuffer
        let decoded = null;

        //let oldh = $('#panel_content_'+this.n).height();
        $('#panel_content_'+this.n).height('auto');
        if (rawData instanceof ArrayBuffer) {

            let datahr = '';
            if (this.msg_reader != null) {
                let v = new DataView(rawData)
                decoded = this.msg_reader.readMessage(v);
                if (this.msg_types[0] == 'std_msgs/msg/String' && decoded.data) {
                    if (decoded.data.indexOf('xml') !== -1)  {
                        datahr = linkifyURLs(escapeHtml(window.xmlFormatter(decoded.data)), true);
                    } else {
                        datahr = linkifyURLs(escapeHtml(decoded.data));
                    }
                    //console.log(window.xmlFormatter)

                } else {
                    datahr = JSON.stringify(decoded, null, 2);
                }
                //datahr = rawData.
            } else {
                datahr = buf2hex(rawData)
            }

            $('#panel_content_'+this.n).html(
                'Stamp: '+ev.timeStamp + '<br>' +
                rawData+' '+rawData.byteLength+'B'+'<br>' +
                '<br>' +
                datahr
            );

            // BATTERY VISUALIZATION
            if (this.msg_types[0] == 'sensor_msgs/msg/BatteryState') {

                this.chart_trace.push({
                    x: decoded.header.stamp.nanosec / 1e9 + decoded.header.stamp.sec,
                    y: decoded.voltage
                });

                if (this.chart_trace.length > this.max_trace_length) {
                    this.chart_trace.shift();
                }

                if (!this.chart) {
                    $('#panel_widget_'+this.n).addClass('enabled');

                    //const div = d3.selectAll();
                    //console.log('d3 div', div)

                    let width = $('#panel_widget_'+this.n).width();
                    let height = $('#panel_content_'+this.n).innerHeight();

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
                            //categories: this.labels_trace,
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

                    this.chart = new ApexCharts(document.querySelector('#panel_widget_'+this.n), options);
                    this.chart.render();
                }

                this.chart.updateSeries([{
                    name: 'Voltage',
                    data: this.chart_trace
                }]);

            }

            // RANGE VISUALIZATION
            if (this.msg_types[0] == 'sensor_msgs/msg/Range') {

                this.chart_trace = [ decoded.range > decoded.max_range ? -1 : decoded.range ];

                //let fullScale = decoded.max_range;
                let gageVal = 100.0 - (Math.min(Math.max(decoded.range, 0), decoded.max_range) * 100.0 / decoded.max_range);

                let width = $('#panel_widget_'+this.n).width();
                let height = $('#panel_content_'+this.n).innerHeight();
                let that = this;


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
                                    //console.log(that.chart_trace);
                                    if (that.chart_trace[0] < 0)
                                        return "> "+decoded.max_range.toFixed(1) +" m";
                                    else
                                        return that.chart_trace[0].toFixed(3) + " m";
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

                if (!this.chart) {
                    $('#panel_widget_'+this.n).addClass('enabled');

                    //const div = d3.selectAll();
                    //console.log('d3 div', div)
                    this.chart = new ApexCharts(document.querySelector('#panel_widget_'+this.n), options);

                    this.chart.render();
                }

                options.series = [ gageVal ];
                this.chart.updateOptions(options);
                // this.chart.updateSeries([
                //     100.0 - gageVal
                // ]);


            }

        } else {
            let datahr = ev.data;
            $('#panel_content_'+this.n).html(
                'Stamp: '+ev.timeStamp + '<br>' +
                '<br>' +
                datahr
            );
        }

        let newh = $('#panel_content_'+this.n).height();
        //console.log('max_height='+this.max_height+' newh='+newh);

        if (newh > this.max_height) {
            this.max_height = newh;
        }
        $('#panel_content_'+this.n).height(this.max_height);


    }

    Close() {
        $('.monitor_panel[data-topic="'+this.topic+'"]').remove();
        console.log('Panel closed for '+this.topic)
    }

}