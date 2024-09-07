import { lerpColor } from "../lib.js";

// RANGE VISUALIZATION
export class RangeWidget {

    static default_width = 1;
    static default_height = 1;

    constructor (panel, topic) {

        this.panel = panel;
        this.topic = topic;

        this.max_range = 0.0;
        this.val = 0.0;

        this.el = $('#panel_widget_'+panel.n);
        this.el.addClass('enabled range');
        this.elLabel = $('<div class="label"></div>');
        this.el.append(this.elLabel);
    }

    onData(decoded) {
       
        let range = decoded.range ? decoded.range : decoded.max_range;

        this.max_range = decoded.max_range;

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
    }
}