import type {ProcessorUtils} from '@drovp/types';
import type {Payload} from './';
import * as Path from 'path';
import * as FS from 'fs';
import * as Stream from 'stream';
import {S3, Endpoint} from 'aws-sdk';
import type {fileTypeFromFile as FileTypeFromFile} from 'file-type';

const nativeImport = (name: string) => eval(`import('${name}')`);
const FTPClient = require('@icetee/ftp'); // no types, yay
const ftpConnections = new Map<string, any>();

export default async ({input, options}: Payload, {progress, output}: ProcessorUtils) => {
	switch (options.target) {
		case 's3': {
			const fileType = (await nativeImport('file-type')).fileTypeFromFile as typeof FileTypeFromFile;
			const requiredOptions = {
				endpoint: `${options.s3.endpoint}`.trim(),
				accessKey: `${options.s3.accessKey}`.trim(),
				secretKey: `${options.s3.secretKey}`.trim(),
				bucket: `${options.s3.bucket}`.trim(),
			};

			/// Validate options
			for (const [key, value] of Object.entries(requiredOptions)) {
				if (!value) throw new Error(`${key} option is required but missing.`);
			}

			const type = (await fileType(input.path))?.mime;

			console.log('type:', type);

			const s3Path = stripSlashes(options.s3.path);
			const key = (s3Path ? `${s3Path}/` : '') + Path.basename(input.path);
			const endpoint = new Endpoint(requiredOptions.endpoint);
			const s3 = new S3({
				endpoint: endpoint,
				accessKeyId: requiredOptions.accessKey,
				secretAccessKey: requiredOptions.secretKey,
				computeChecksums: options.s3.checksum,
			});
			const result = await s3
				.upload({
					Bucket: requiredOptions.bucket,
					Key: key,
					Body: FS.createReadStream(input.path),
					ContentType: type,
					ACL: options.s3.acl || undefined,
				})
				.on('httpUploadProgress', ({loaded, total}) => {
					progress(loaded, total);
				})
				.promise();
			output.url(result.Location);
			break;
		}

		case 'ftp': {
			const result = await uploadToFTP(input.path, {...options.ftp, onProgress: progress});
			if (result) output.url(result);
			break;
		}

		default:
			throw new Error(`Unknown target "${options.target}".`);
	}
};

async function uploadToFTP(
	path: string,
	{
		username,
		password,
		ip,
		port,
		path: serverPath,
		baseUrl,
		onProgress,
	}: Payload['options']['ftp'] & {onProgress: (completed: number, total: number) => void}
) {
	return new Promise<string | undefined>(async (resolve, reject) => {
		// Create/cache connection
		const connectionId = `${ip}:${port}:${username}:${password}`;
		let connection = ftpConnections.get(connectionId);
		if (!connection) {
			connection = await makeFTPConnection({username, password, ip, port});
			ftpConnections.set(connectionId, connection);
		}

		// Decide destination path
		serverPath = stripSlashes(serverPath.trim());
		const pathParts = serverPath ? [serverPath] : [];
		pathParts.push(Path.basename(path));

		// Upload the file
		connection.put(await makeReadableFileStream(path, onProgress), pathParts.join('/'), (error: any) => {
			if (error) {
				reject(error);
			} else {
				resolve(
					baseUrl
						? `${stripSlashes(baseUrl)}/${pathParts.map((part) => encodeURIComponent(part)).join('/')}`
						: undefined
				);
			}
		});
	});
}

function makeFTPConnection({username, password, ip, port}: Omit<Payload['options']['ftp'], 'baseUrl' | 'path'>) {
	return new Promise<any>((resolve, reject) => {
		const client = new FTPClient();
		client.on('ready', () => {
			resolve(client);
		});
		client.on('error', (error: any) => {
			reject(error);
		});
		client.connect({
			host: ip,
			port,
			user: username,
			password,
		});
	});
}

async function makeReadableFileStream(path: string, onProgress: (completed: number, total: number) => void) {
	const stat = await FS.promises.stat(path);
	const total = stat.size;
	let completed = 0;

	const trackingStream = new Stream.Transform({
		transform(chunk, encoding, callback) {
			completed += chunk.length;
			onProgress(completed, total);
			this.push(chunk);
			callback();
		},
	});

	return Stream.pipeline(FS.createReadStream(path), trackingStream, (err) => {
		if (err) {
			console.log(`readable file stream error\ncode: ${err.code}\nerrno: ${err.errno}\nmessage: ${err.message}`);
		}
	});
}

/**
 * HELPERS.
 */

function stripSlashes(value: any) {
	return `${value}`.trim().replace(/^[\\\/\.]+|[\\\/\.]+$/, '');
}
