export type IdCardField = {
	label: string;
	value: string;
};

export type IdCardConfig = {
	documentTitle: string;
	brand: string;
	status: string;
	latinNameLines: string[];
	localName: string;
	fields: IdCardField[];
	statementLines: string[];
	interactionHint: string;
	networkAriaLabel: string;
};
