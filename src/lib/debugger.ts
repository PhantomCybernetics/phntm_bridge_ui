class Debugger {
	label: string = "";
	static instance: Debugger | null = null;

	static Get(label?: string) {
		if (Debugger.instance === null) {
			Debugger.instance = new Debugger();
		}
		if (label) {
			Debugger.instance.label = label;
		}
		return Debugger.instance;
	}

	constructor() {}

	l(data: any, ...args: any[]): void {
		if (args.length) return this.log(data, args);
		else return this.log(data);
	}
	log(data: any, ...args: any[]): void {
		if (args.length > 0) {
			console.log(this.label, data, args.length > 1 ? args : args[0]);
		} else {
			console.log(this.label, data);
		}
	}

	e(data: string, ...args: any[]): void {
		if (args.length) return this.err(data, args);
		else return this.err(data);
	}
	err(data: string, ...args: any[]): void {
		if (args.length > 0) {
			console.log(this.label, data.red, args.length > 1 ? args : args[0]);
		} else {
			console.log(this.label, data.red);
		}
	}
}

export { Debugger };
