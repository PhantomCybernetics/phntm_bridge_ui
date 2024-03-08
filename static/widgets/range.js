import { lerpColor } from "../lib.js";

// RANGE VISUALIZATION
export class RangeWidget {

    constructor (panel, topic) {

        this.panel = panel;
        this.topic = topic;

        // this.data_trace = [];
        this.max_range = 0.0;
        this.val = 0.0;

        let that = this;

        // let options = {
        //     chart: {
        //         height: '100%',
        //         width: '100%',
        //         type: "radialBar",
        //         offsetY: 10,
        //         redrawOnParentResize: true,
        //     },
        //     series: [ ],
        //     colors: [ function(ev) {
        //         return lerpColor('#259FFB', '#ff0000', ev.value / 100.0);
        //     } ],

        //     plotOptions: {
        //         radialBar: {
        //             hollow: {
        //                 margin: 15,
        //                 size: "70%"
        //             },
        //             track: {
        //                 show: true,
        //             },
        //             startAngle: -135,
        //             endAngle: 135,
        //             dataLabels: {
        //                 showOn: "always",
        //                 name: {
        //                     offsetY: -10,
        //                     show: true,
        //                     color: "#888",
        //                     fontSize: "13px"
        //                 },
        //                 value: {
        //                     color: "#111",
        //                     fontSize: "20px",
        //                     show: true,
        //                     formatter: function(val) {

        //                         if (val < 0.001)
        //                             return "> "+that.max_range.toFixed(1) +" m";
        //                         else
        //                             return that.val.toFixed(3) + " m";
        //                     }
        //                 }
        //             }
        //         }
        //     },
        //     stroke: {
        //         lineCap: "round",
        //     },
        //     labels: ["Distance"]
        // };

        this.el = $('#panel_widget_'+panel.n);
        this.el.addClass('enabled range');
        this.elLabel = $('<div class="label"></div>');
        this.el.append(this.elLabel);

        // this.chart = new ApexCharts(document.querySelector('#panel_widget_'+panel.n), options);
        // this.chart.render();
    }

    onClose() {
    }

    colorFromVal() {
        
    }

    onData(decoded) {
       
        let range = decoded.range ? decoded.range : decoded.max_range;

        this.max_range = decoded.max_range;
        // this.data_trace[0] = range; // val in m

        //display gage pos
        this.val = range;

        let gageVal = 100.0 - (Math.min(Math.max(range, 0), decoded.max_range) * 100.0 / decoded.max_range);
        gageVal = gageVal / 100.0;
        let color = '';
        if (gageVal < 0.5)
            color = lerpColor('#ffffff', '#2696FB',  gageVal*2.0);
        else 
            color = lerpColor('#2696FB', '#ff0000',  (gageVal-0.5)*2.0);

        if (this.val > decoded.max_range-0.001)
            this.elLabel.html("> "+this.max_range.toFixed(1) +" m");
        else
            this.elLabel.html(this.val.toFixed(3) + " m"); //<br><span style=\"font-size:10px;\">("+gageVal.toFixed(1)+")</span>");

        this.el.css('background-color', color);
        this.elLabel.css('color', gageVal < .2 ? 'black' : 'white');
        // this.chart.updateSeries([ gageVal ], false);
    }
}