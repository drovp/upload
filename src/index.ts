import {Plugin, PayloadData, OptionsSchema, makeAcceptsFlags} from '@drovp/types';

export type Payload = PayloadData<Options, typeof acceptsFlags>;
type Options = {
	target: 's3' | 'ftp';
	s3: {
		accessKey: string;
		secretKey: string;
		bucket: string;
		path: string;
		endpoint: string;
		acl: string;
		checksum: boolean;
	};
	ftp: {
		username: string;
		password: string;
		path: string;
		ip: string;
		port: number;
		baseUrl: string;
	};
};

const optionsSchema: OptionsSchema<Options> = [
	{name: 'target', type: 'select', options: {s3: 'S3', ftp: 'FTP'}, default: 's3', title: 'Target'},
	{
		name: 's3',
		type: 'namespace',
		title: 'S3 compatible storage',
		isHidden: (_, {target}) => target !== 's3',
		schema: [
			{
				name: 'endpoint',
				type: 'string',
				min: 1,
				default: 's3.amazonaws.com',
				title: 'Endpoint',
				description: `To include a region, use <code>s3.&lt;Region&gt;.amazonaws.com</code>`,
			},
			{name: 'accessKey', type: 'string', min: 1, title: 'Access key'},
			{name: 'secretKey', type: 'string', min: 1, title: 'Secret key'},
			{name: 'bucket', type: 'string', min: 1, title: 'Bucket name'},
			{
				name: 'path',
				type: 'string',
				title: 'Path',
				description: `Directory on the server where the files should end up. Example: <code>foo/bar</code>. Leading and trailing slashes will be stripped.`,
			},
			{
				name: 'acl',
				type: 'select',
				options: [
					'private',
					'public-read',
					'public-read-write',
					'authenticated-read',
					'aws-exec-read',
					'bucket-owner-read',
					'bucket-owner-full-control',
				],
				default: 'public-read',
				title: 'ACL',
				description: `Access control list. Leave as <code>public-read</code> for files to be downloadable by everyone.`,
			},
			{
				name: 'checksum',
				type: 'boolean',
				title: 'Checksum files',
				description: `Compute md5 hash of a file before sending it so that it can be verified on the target server, ensuring the file wasn't corrupted during transit. If it was, the operation will end with an error.<br>Disadvantage is that computing checksums of big files takes time.`,
			},
		],
	},
	{
		name: 'ftp',
		type: 'namespace',
		title: 'FTP server',
		isHidden: (_, {target}) => target !== 'ftp',
		schema: [
			{name: 'username', type: 'string', default: 'anonymous', title: 'Username'},
			{name: 'password', type: 'string', title: 'Password'},
			{
				name: 'path',
				type: 'string',
				title: 'Path',
				description: `Directory on the server where the files should end up. Example: <code>foo/bar</code>. Depending on the server, the directory probably has to exist. Leading and trailing slashes will be stripped.`,
			},
			{name: 'ip', type: 'string', min: 1, title: 'IP address'},
			{name: 'port', type: 'number', default: 21, title: 'Port'},
			{
				name: 'baseUrl',
				type: 'string',
				title: 'Base URL',
				description: `To output URLs to the uploaded files, uploader needs to know the base URL to the files on the FTP server.<br>The resulting URL will be constructed as <code>\${baseUrl}/\${path}/\${filename}</code>`,
			},
		],
	},
];
const acceptsFlags = makeAcceptsFlags<Options>()({files: true});

export default (plugin: Plugin) => {
	plugin.registerProcessor<Payload>('upload', {
		main: 'dist/processor.js',
		description: 'Upload files to S3 compatible stores and FTP servers.',
		accepts: acceptsFlags,
		threadType: 'upload',
		options: optionsSchema,
	});
};
