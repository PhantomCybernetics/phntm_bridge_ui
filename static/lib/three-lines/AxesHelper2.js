import * as THREE from "three";
import { LineSegments2 } from "line-segments2";
import { LineMaterial } from "line-material2";
import { LineSegmentsGeometry as LineSegmentsGeometry2} from "line-segments-geometry2";

/**
 * An axis object to visualize the 3 axes in a simple way.
 * The X axis is red. The Y axis is green. The Z axis is blue.
 *
 * ```js
 * const axesHelper = new THREE.AxesHelper( 5 );
 * scene.add( axesHelper );
 * ```
 *
 * @augments LineSegments2
 */
class AxesHelper2 extends LineSegments2 {

	/**
	 * Constructs a new axes helper.
	 *
	 * @param {number} [size=1] - Size of the lines representing the axes.
	 */
	constructor( size = 1, lineWidth = 2 ) {

		const vertices = [
			0, 0, 0,	size, 0, 0,
			0, 0, 0,	0, size, 0,
			0, 0, 0,	0, 0, size
		];

		const colors = [
			1, 0, 0, 1,		1, 0.6, 0, 1,
			0, 1, 0, 1, 	0.6, 1, 0, 1,
			0, 0, 1, 1,		0, 0.6, 1, 1,
		];

		const geometry = new LineSegmentsGeometry2();
		geometry.setPositions(vertices)
		geometry.setColors(colors);
		// geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
		// geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );

		const material = new LineMaterial( { vertexColors: true, toneMapped: false, linewidth: lineWidth } );

		super( geometry, material );

		this.type = 'AxesHelper';

	}

	/**
	 * Defines the colors of the axes helper.
	 *
	 * @param {number|Color|string} xAxisColor - The color for the x axis.
	 * @param {number|Color|string} yAxisColor - The color for the y axis.
	 * @param {number|Color|string} zAxisColor - The color for the z axis.
	 * @return {AxesHelper} A reference to this axes helper.
	 */
	setColors( xAxisColor, yAxisColor, zAxisColor ) {

		const color = new THREE.Color();
		const array = this.geometry.attributes.color.array;

		color.set( xAxisColor );
		color.toArray( array, 0 );
		color.toArray( array, 3 );

		color.set( yAxisColor );
		color.toArray( array, 6 );
		color.toArray( array, 9 );

		color.set( zAxisColor );
		color.toArray( array, 12 );
		color.toArray( array, 15 );

		this.geometry.attributes.color.needsUpdate = true;

		return this;

	}

	/**
	 * Frees the GPU-related resources allocated by this instance. Call this
	 * method whenever this instance is no longer used in your app.
	 */
	dispose() {

		this.geometry.dispose();
		this.material.dispose();

	}

}


export { AxesHelper2 };
