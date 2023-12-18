import { lerpColor } from "./../lib.js";
import '/static/canvasjs-charts/canvasjs.min.js';

// BATTERY VISUALIZATION
export class BatteryStateWidget {

    constructor(panel, topic) {
        this.panel = panel;
        this.topic = topic;

        this.minVoltage = 3.2*3; //todo load from robot
        this.maxVoltage = 4.2*3;

        $('#panel_widget_'+panel.n).addClass('enabled battery');

        // let options = {
        //     series: [ ],
        //     chart: {
        //         height: '100%',
        //         width: '100%',
        //         type: 'line',
        //         parentHeightOffset: 0,
        //         zoom: {
        //             enabled: false
        //         },
        //         animations: {
        //             enabled: false,
        //             dynamicAnimation: {
        //                 enabled: false
        //             }
        //         },
        //         selection: {
        //             enabled: false
        //         },
        //         redrawOnParentResize: true,

        //     },
        //     stroke: {
        //         curve: 'straight',
        //     },
        //     grid: {
        //         row: {
        //             colors: ['#f3f3f3', 'transparent'], // takes an array which will be repeated on columns
        //             opacity: 0.5
        //         },
        //     },
        //     xaxis: {
        //         labels: {
        //             show: false,
        //         }
        //     },
        //     yaxis: {
        //         min: this.minVoltage-0.2,
        //         max: this.maxVoltage+0.2,
        //         decimalsInFloat: 2,
        //         labels: {
        //             formatter: function (value) {
        //                 return value.toFixed(2) + " V";
        //             }
        //         },
        //     },
        //     annotations: {
        //         yaxis: [

        //         ]
        //     },
        //     tooltip: {
        //         enabled: false,
        //     }
        // };

        // if (this.maxVoltage > 0) {
        //     options.annotations.yaxis.push({
        //         y: this.maxVoltage,
        //         borderColor: '#00E396',
        //         label: {
        //             borderColor: '#00E396',
        //             style: {
        //             color: '#fff',
        //             background: '#00E396'
        //             },
        //             text: 'Full'
        //         }
        //         });
        // }
        // if (this.minVoltage > 0) {
        //     options.annotations.yaxis.push({
        //         y: this.minVoltage,
        //         borderColor: '#ff0000',
        //         label: {
        //             borderColor: '#ff0000',
        //             style: {
        //             color: '#fff',
        //             background: '#ff0000'
        //             },
        //             text: 'Empty'
        //         }
        //     });
        // }

        // this.chart = new ApexCharts(document.querySelector('#panel_widget_'+panel.n), options);
        // this.chart.render();

        this.data_trace = [];

        this.chart = new CanvasJS.Chart('panel_widget_'+panel.n, {
            //Chart Options - Check https://canvasjs.com/docs/charts/chart-options/
            // title:{
            //   text: "Basic Column Chart in JavaScript"              
            // },
            // width: panel.widget_width,
            // height: panel.widget_height,
            toolTip:{
                contentFormatter: function ( e ) {
                    return e.entries[0].dataPoint.y.toFixed(2)+' V'; 
                }
            },
            axisX: {
                labelFormatter: function ( e ) {
                    return '';  
                },
                lineThickness: 0,
                tickThickness: 0,
            },
            axisY: {
                minimum: this.minVoltage-1.0,
                maximum: this.maxVoltage+1.0,
                // lineColor: "red",
                gridColor: "#dddddd",
                labelFontSize: 12,
                lineThickness: 0,
                labelFormatter: function ( e ) {
                    return e.value.toFixed(1)+' V';  
                },
                // tickLength: 2,
                stripLines: [
                    {                
                        value: this.maxVoltage,
                        color: "#77AE23",
                        label: "Full",
                        labelFontColor: "white",
                        labelBackgroundColor: "#77AE23",
                        lineDashType: "dot",
                        thickness: 2,
                        labelFontSize:12,
                    },
                    {                
                        // startValue: this.minVoltage-1.0,
                        value: this.minVoltage,                
                        color:"#cc0000",
                        label: "\ Empty",
                        labelFontColor: "white",
                        labelBackgroundColor: "#cc0000",
                        lineDashType: "solid",
                        thickness: 1,
                        labelFontSize:12,
                    },
                ],
                
            },
            data: [{
                type: "line",
                lineThickness: 3,
                dataPoints: this.data_trace
            }]
            
          });
        // console.warn('setting wxh='+panel.widget_width+'x'+panel.widget_height);
        //Render Chart
        this.chart.render();

        panel.resize_event_handler = () => { this.onResize() } ; //no need here
    }

    onResize() {
        this.chart.render();
    }

    onClose() {
    }

    onData = (decoded) => {

        if (!this.chart)
            return;

        let c = '#2696FB';
        let range2 = (this.maxVoltage-this.minVoltage)/2.0;

        if (decoded.voltage < this.minVoltage)
            c = '#ff0000';
        else if (decoded.voltage > this.maxVoltage) 
            c = '#00ff00';
        else if (decoded.voltage > this.minVoltage+range2) {
            let amount = (decoded.voltage-this.minVoltage-range2)/range2;
            c = lerpColor('#2696FB', '#00ff00', amount);
        } else {
            let amount = (decoded.voltage-this.minVoltage)/range2;
            c = lerpColor('#ff0000', '#2696FB', amount);
        }
        // if (decoded.voltage < (this.minVoltage+()/2.0)) 
        //     c = '';

        this.data_trace.push({
            x: decoded.header.stamp.nanosec / 1e9 + decoded.header.stamp.sec,
            y: decoded.voltage,
            label: decoded.voltage.toFixed(2)+'V',
            markerColor: c,
            lineColor: c,
            markerSize: 0
        });

        if (this.data_trace.length > this.panel.max_trace_length) {
            this.data_trace.shift();
        }

        this.chart.render();
    }
}