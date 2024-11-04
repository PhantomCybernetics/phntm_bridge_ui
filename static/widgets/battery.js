import { lerpColor } from "./../inc/lib.js";
import '/static/canvasjs-charts/canvasjs.min.js';

// BATTERY VISUALIZATION
export class BatteryStateWidget {

    static default_width = 4;
    static default_height = 2;

    constructor(panel, topic) {
        this.panel = panel;
        this.topic = topic;

        this.minVoltage = 0; // override these
        this.maxVoltage = 0; // in topic config

        $('#panel_widget_'+panel.n).addClass('enabled battery');
        
        let that = this;

        this.onTopicConfigUpdate = (config) => {
            console.warn('battery onTopicConfigUpdate', config, this);
            if (config) {
                this.minVoltage = config.min_voltage;
                this.maxVoltage = config.max_voltage;
                this.makeChart();
            }
        }

        // make chart when we have topic config
        this.panel.ui.client.onTopicConfig(topic, this.onTopicConfigUpdate); //', (t, c) => that.onTopicConfigUpdate(t, c))
    
        panel.resizeEventHandler = () => { that.onResize() } ; //no need here
    }

    makeChart() {
        this.data_trace = [];
        if (this.chart) {
            console.log('clearing old battery chart')
            this.chart.destroy();
            $('#panel_widget_'+this.panel.n).empty();
        }
        this.chart = new CanvasJS.Chart('panel_widget_'+this.panel.n, {
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
                        labelFontSize: 12,
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
                        labelFontSize: 12,
                    },
                ],
                
            },
            data: [{
                type: "line",
                lineThickness: 3,
                dataPoints: this.data_trace
            }]
            
        });

        this.chart.render();
    }

    onResize() {
        if (this.chart)
            this.chart.render();
    }

    onClose() {
        this.panel.ui.client.removeTopicConfigHandler(this.topic, this.onTopicConfigUpdate);
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