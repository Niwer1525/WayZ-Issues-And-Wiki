/* Variables */
let exportButton;
let seatsButton;
let _obj_export;

let shouldExportMTL = false;
let shouldExportModel = false;
let shouldExportCollisions = false;

const doubleTab = "		";
const cube_face_normals = { north: [0, 0, -1], east: [1, 0, 0], south: [0, 0, 1], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] }

/**
 * Round a number to 6 decimals
 * @param {*} numb The number to round
 * @returns The rounded number
 */
function roundNumber(numb) { return Number(numb).toFixed(6); }

function getMtlFace(obj, index) {
	const tex = obj.faces[Canvas.face_order[index]]?.getTexture();
	return tex ? `usemtl ${typeof tex === 'string' ? 'none' : 'm_' + tex.id}` : false;
}	

function getAllGroups(children = Outliner.root) {
	return children.flatMap(obj => obj instanceof Group ? [obj, ...getAllGroups(obj.children)] : []);
}

/**
 * Fix the loop mode to the mod's format
 * @param {*} mode The mode to fix
 * @returns The fixed mode
 */
function fixLoopMode(mode) { return { once: "ONCE", hold: "HOLD_ON_LAST", loop: "LOOP" }[mode] || "ONCE"; }

const CODEC_OBJ = new Codec('obj', {
	name: 'OBJ Wavefront Model',
	extension: 'obj',
	compile(options) {
		if (!options) options = 0;
		var old_scene_position = new THREE.Vector3().copy(scene.position);
		scene.position.set(0,0,0);

		let materials = {};
		let output = [];
		let indexVertex = 0;
		let indexVertexUvs = 0;
		let indexNormals = 0;
		const vertex = new THREE.Vector3();
		const normal = new THREE.Vector3();
		const uv = new THREE.Vector2();
		const face = [];
		var collisions = [];

		if(options != 1 && shouldExportMTL) output.push('mtllib ' + (options.mtl_name||'materials.mtl'));
		var parseMesh = function ( mesh ) {
			var nbVertex = 0;
			var nbVertexUvs = 0;
			var nbNormals = 0;

			var geometry = mesh.geometry;
			var element  = OutlinerNode.uuids[mesh.name];
			const normalMatrixWorld = new THREE.Matrix3();

			if (!element) return;
			if (element.export === false) return;

			normalMatrixWorld.getNormalMatrix( mesh.matrixWorld );

			if (element instanceof Cube) {
				if((element.parent != null && element.parent.cube != null && element.parent.cube.count <= 1 && element.parent.name.includes("collision")) || element.name.includes("collision")) {
					let collision = { e: element, m: mesh}
					collisions.push(collision);
					return;
				}
				if(options == 1) return;
				if(element.parent != null && element.parent.cube != null && element.parent.cube.count <= 1) output.push(`o ${element.parent.name||'mesh'}`)
				else output.push(`o ${element.name||'mesh'}`) 
				if(element.parent != null && element.parent.cube != null) output.push('pivot ' + roundNumber(element.parent.origin[0]) + " " + roundNumber(element.parent.origin[1]) + " " + roundNumber(element.parent.origin[2]))
				else output.push('pivot ' + roundNumber(element.origin[0]) + " " + roundNumber(element.origin[1]) + " " + roundNumber(element.origin[2]))
				
				function addVertex(x, y, z) {
					vertex.set(x - element.origin[0], y - element.origin[1], z - element.origin[2]);
					vertex.applyMatrix4( mesh.matrixWorld ).divideScalar(16);
					output.push('v ' + vertex.x + ' ' + vertex.y + ' ' + vertex.z);
					nbVertex++;
				}
				addVertex(element.to[0]   + element.inflate, element.to[1] +	element.inflate, element.to[2]  	+ element.inflate);
				addVertex(element.to[0]   + element.inflate, element.to[1] +	element.inflate, element.from[2]  	- element.inflate);
				addVertex(element.to[0]   + element.inflate, element.from[1] -	element.inflate, element.to[2]  	+ element.inflate);
				addVertex(element.to[0]   + element.inflate, element.from[1] -	element.inflate, element.from[2]  	- element.inflate);
				addVertex(element.from[0] - element.inflate, element.to[1] +	element.inflate, element.from[2]  	- element.inflate);
				addVertex(element.from[0] - element.inflate, element.to[1] +	element.inflate, element.to[2]  	+ element.inflate);
				addVertex(element.from[0] - element.inflate, element.from[1] -	element.inflate, element.from[2]  	- element.inflate);
				addVertex(element.from[0] - element.inflate, element.from[1] -	element.inflate, element.to[2]  	+ element.inflate);

				for (let key in element.faces) {
					if (element.faces[key].texture !== null) {
						let face = element.faces[key];
						let uv_outputs = [];
						uv_outputs.push(`vt ${face.uv[0] / Project.texture_width} ${1 - face.uv[1] / Project.texture_height}`);
						uv_outputs.push(`vt ${face.uv[2] / Project.texture_width} ${1 - face.uv[1] / Project.texture_height}`);
						uv_outputs.push(`vt ${face.uv[2] / Project.texture_width} ${1 - face.uv[3] / Project.texture_height}`);
						uv_outputs.push(`vt ${face.uv[0] / Project.texture_width} ${1 - face.uv[3] / Project.texture_height}`);
						var rot = face.rotation || 0;
						while (rot > 0) {
							uv_outputs.splice(0, 0, uv_outputs.pop());
							rot -= 90;
						}
						output.push(...uv_outputs);
						nbVertexUvs += 4;
					}
				}
				for (let key in element.faces) {
					if (element.faces[key].texture !== null) {
						normal.fromArray(cube_face_normals[key]);
						normal.applyMatrix3( normalMatrixWorld ).normalize();
						output.push('vn ' + normal.x + ' ' + normal.y + ' ' + normal.z );
						nbNormals += 1;
					}
				}

				let mtl;
				let i = 0;
				for (let key in element.faces) {
					if (element.faces[key].texture !== null) {
						let tex = element.faces[key].getTexture()
						if (tex && tex.uuid && !materials[tex.id]) { materials[tex.id] = tex; }

						/* Try to add the use mtl if needed */
						if(shouldExportMTL) {
							let mtl_new = (!tex || typeof tex === 'string') ? 'none' : 'm_' + tex.id;
							if (mtl_new != mtl) {
								mtl = mtl_new;
								output.push('usemtl '+mtl);
							}
						}

						let vertices;
						switch (key) {
							case 'north': vertices = [2, 5, 7, 4]; break;
							case 'east': vertices = [1, 2, 4, 3]; break;
							case 'south': vertices = [6, 1, 3, 8]; break;
							case 'west': vertices = [5, 6, 8, 7]; break;
							case 'up': vertices = [5, 2, 1, 6]; break;
							case 'down': vertices = [8, 3, 4, 7]; break;
						}
						output.push('f '+[
							`${vertices[3] + indexVertex}/${i*4 + 4 + indexVertexUvs}/${i+1+indexNormals}`,
							`${vertices[2] + indexVertex}/${i*4 + 3 + indexVertexUvs}/${i+1+indexNormals}`,
							`${vertices[1] + indexVertex}/${i*4 + 2 + indexVertexUvs}/${i+1+indexNormals}`,
							`${vertices[0] + indexVertex}/${i*4 + 1 + indexVertexUvs}/${i+1+indexNormals}`,
						].join(' '));
						i++;
					}
				}
			} else if (element instanceof Mesh) {
				if(options == 1) return;
				if(element.parent != null && element.parent.mesh != null && element.parent.mesh.count <= 1) { output.push(`o ${element.parent.name||'mesh'}`) }
				else { output.push(`o ${element.name||'mesh'}`) } 
				if(element.parent != null && element.parent.mesh != null) {output.push('pivot ' + roundNumber(element.parent.origin[0]) + " " + roundNumber(element.parent.origin[1]) + " " + roundNumber(element.parent.origin[2])) }
				else { output.push('pivot ' + roundNumber(element.origin[0]) + " " + roundNumber(element.origin[1]) + " " + roundNumber(element.origin[2])) }
				
				let vertex_keys = [];
				function addVertex(x, y, z) {
					vertex.set(x, y, z);
					vertex.applyMatrix4( mesh.matrixWorld ).divideScalar(16);
					output.push('v ' + roundNumber(vertex.x) + ' ' + roundNumber(vertex.y) + ' ' + roundNumber(vertex.z));
					nbVertex++;
				}
				for (let vkey in element.vertices) {
					addVertex(...element.vertices[vkey]);
					vertex_keys.push(vkey);
				}

				let mtl;
				let i = 0;
				let vertexnormals = [];
				let faces = [];
				for (let key in element.faces) {
					if (element.faces[key].texture !== null && element.faces[key].vertices.length >= 3) {
						let face = element.faces[key];
						let vertices = face.getSortedVertices();
						let tex = element.faces[key].getTexture();

						vertices.forEach(vkey => {
							output.push(`vt ${roundNumber(face.uv[vkey][0] / Project.texture_width)} ${roundNumber(1 - face.uv[vkey][1] / Project.texture_height)}`);
							nbVertexUvs += 1;
						})

						normal.fromArray(face.getNormal(true));
						normal.applyMatrix3( normalMatrixWorld ).normalize();
						vertexnormals.push('vn ' + roundNumber(normal.x) + ' ' + roundNumber(normal.y) + ' ' + roundNumber(normal.z) );
						nbNormals += 1;
						
						/* Try to add the use mtl if needed */
						if(shouldExportMTL) {
							if (tex && tex.uuid && !materials[tex.id]) { materials[tex.id] = tex; }
							let mtl_new = (!tex || typeof tex === 'string') ? 'none' : 'm_' + tex.id;
							if (mtl_new != mtl) {
								mtl = mtl_new;
								faces.push('usemtl '+mtl);
							}
						}
						
						let triplets = [];
						vertices.forEach((vkey, vi) => {
							let triplet = [
								vertex_keys.indexOf(vkey) + 1 + indexVertex,
								nbVertexUvs - vertices.length + vi + 1 + indexVertexUvs,
								i+1+indexNormals,
							]
							triplets.push(triplet.join('/'));
						})
						faces.push('f ' + triplets.join(' '));
						i++;
					}
				}
				output.push(...vertexnormals);
				output.push(...faces);
			} else {
				const vertices = geometry.getAttribute( 'position' );
				const normals = geometry.getAttribute( 'normal' );
				const uvs = geometry.getAttribute( 'uv' );
				const indices = geometry.getIndex();

				output.push('o ' + mesh.name);

				if (mesh.material && mesh.material.name) { output.push('usemtl ' + mesh.material.name); }

				if (vertices !== undefined) {
					for ( let i = 0, l = vertices.count; i < l; i ++, nbVertex ++ ) {
						vertex.x = vertices.getX( i );
						vertex.y = vertices.getY( i );
						vertex.z = vertices.getZ( i );
						vertex.applyMatrix4( mesh.matrixWorld ).divideScalar(16);
						output.push('v ' + vertex.x + ' ' + vertex.y + ' ' + vertex.z);
					}
				}

				if ( uvs !== undefined ) {
					for ( let i = 0, l = uvs.count; i < l; i ++, nbVertexUvs ++ ) {
						uv.x = uvs.getX( i );
						uv.y = uvs.getY( i );
						output.push('vt ' + uv.x + ' ' + uv.y);
					}
				}

				if (normals !== undefined) {
					normalMatrixWorld.getNormalMatrix( mesh.matrixWorld );
					for ( let i = 0, l = normals.count; i < l; i ++, nbNormals ++ ) {
						normal.x = normals.getX( i );
						normal.y = normals.getY( i );
						normal.z = normals.getZ( i );
						normal.applyMatrix3( normalMatrixWorld ).normalize();
						output.push('vn ' + normal.x + ' ' + normal.y + ' ' + normal.z );
					}
				}

				for (let key in element.faces) {
					let tex = element.faces[key].getTexture()
					if (tex && tex.uuid && !materials[tex.id]) { materials[tex.id] = tex }
				}

				if ( indices !== null ) {
					for ( let i = 0, l = indices.count; i < l; i += 3 ) {
						let f_mat = getMtlFace(element, geometry.groups[ Math.floor(i / 6) ].materialIndex)
						if (f_mat) {
							if (i % 2 === 0) { output.push(f_mat) }
							for ( let m = 0; m < 3; m ++ ) {
								const j = indices.getX( i + m ) + 1;
								face[ m ] = indexVertex + j + ( normals || uvs ? '/' + ( uvs ? indexVertexUvs + j : '' ) + ( normals ? '/' + ( indexNormals + j ) : '' ) : '' );
							}
							output.push('f ' + face.join( ' ' ) );
						}
					}
				} else {
					for ( let i = 0, l = vertices.count; i < l; i += 3 ) {
						for ( let m = 0; m < 3; m ++ ) {
							const j = i + m + 1;
							face[ m ] = indexVertex + j + ( normals || uvs ? '/' + ( uvs ? indexVertexUvs + j : '' ) + ( normals ? '/' + ( indexNormals + j ) : '' ) : '' );
						}
						output.push('f ' + face.join( ' ' ) );
					}
				}
			}
			indexVertex += nbVertex;
			indexVertexUvs += nbVertexUvs;
			indexNormals += nbNormals;
		};

		scene.traverse( function (child) {
			if (child instanceof THREE.Mesh) parseMesh(child);
		});
		var loose_elements = [];
		Outliner.root.forEach(obj => {
			if (obj instanceof OutlinerElement) loose_elements.push(obj);
		})
		var groups = getAllGroups();
		if (loose_elements.length) {
			let group = new Group({ name: 'defaultGroup' });
			group.children.push(...loose_elements);
			group.is_catch_bone = true;
			group.createUniqueName();
			groups.splice(0, 0, group);
		}

		groups.forEach(function(g) {
			if (g.type !== 'group') return;
			for (var obj of g.children) {
				if (obj instanceof Locator || obj instanceof NullObject) {
					let key = obj.name;
					let offset = obj.position.slice();
					offset[0] *= -1;
					output.push('locator '+key +" "+ offset[0]+" "+offset[1]+" "+offset[2]);
				}
			}
		})

		/* Export collisions */
		if(options == 1) {
			output.push('"collisions": [');

			for (let i = 0; i < collisions.length; i++) {
				let element = collisions[i].e;
				let vertices = [];
				
				function addCollisiionVertex(x, y, z) {
					vertex.set(x - element.origin[0], y - element.origin[1], z - element.origin[2]);
					vertex.divideScalar(16);
					vertices.push({ x: vertex.x, y: vertex.y, z: vertex.z });
				}

				addCollisiionVertex(element.to[0]   + element.inflate, element.to[1] +	element.inflate, element.to[2]  	+ element.inflate);
				addCollisiionVertex(element.to[0]   + element.inflate, element.to[1] +	element.inflate, element.from[2]  	- element.inflate);
				addCollisiionVertex(element.to[0]   + element.inflate, element.from[1] -	element.inflate, element.to[2]  	+ element.inflate);
				addCollisiionVertex(element.to[0]   + element.inflate, element.from[1] -	element.inflate, element.from[2]  	- element.inflate);
				addCollisiionVertex(element.from[0] - element.inflate, element.to[1] +	element.inflate, element.from[2]  	- element.inflate);
				addCollisiionVertex(element.from[0] - element.inflate, element.to[1] +	element.inflate, element.to[2]  	+ element.inflate);
				addCollisiionVertex(element.from[0] - element.inflate, element.from[1] -	element.inflate, element.from[2]  	- element.inflate);
				addCollisiionVertex(element.from[0] - element.inflate, element.from[1] -	element.inflate, element.to[2]  	+ element.inflate);
				
				let minX = vertices[0].x;
				let minY = vertices[0].y;
				let minZ = vertices[0].z;
				for (let vert = 0; vert < vertices.length; vert++) {
					let v = vertices[vert];
					if(v.x < minX) minX = v.x;
					if(v.y < minY) minY = v.y;
					if(v.z < minZ) minZ = v.z;
				}
				let maxX = vertices[0].x;
				let maxY = vertices[0].y;
				let maxZ = vertices[0].z;
				for (let vert = 0; vert < vertices.length; vert++) {
					let v = vertices[vert];
					if(v.x > maxX) maxX = v.x;
					if(v.y > maxY) maxY = v.y;
					if(v.z > maxZ) maxZ = v.z;
				}
				
				/* Print the collision text */
				output.push('	{');
				output.push(`${doubleTab}"_comment": "${element.name}",`);
				output.push(`${doubleTab}"mesh": "",`);
				output.push(`${doubleTab}"minX": ${minX}, "minY": ${minY}, "minZ": ${minZ},`);
				output.push(`${doubleTab}"maxX": ${maxX}, "maxY": ${maxY}, "maxZ": ${maxZ},`);
				output.push(`${doubleTab}"offset": { "x": ${element.origin[0]/16}, "y": ${element.origin[1]/16}, "z": ${element.origin[2]/16} },`);
				output.push(`${doubleTab}"rotation": { "x": ${element.rotation[1]}, "y": ${element.rotation[0]}, "z": ${element.rotation[2]} }`);
				output.push('	}' + (i == collisions.length-1 ? "": ","));
			}
			output.push('],');
		}

		var mtlOutput = '';
		for (var key in materials) {
			if (materials.hasOwnProperty(key) && materials[key]) {
				var tex = materials[key];
				mtlOutput += 'newmtl m_' +key+ '\n'
				mtlOutput += `map_Kd ${tex.name} \n`;
			}
		}
		mtlOutput += 'newmtl none'
		scene.position.copy(old_scene_position)
		output = output.join('\n');
		_obj_export = {
			obj: output,
			mtl: mtlOutput,
			images: materials
		}
		this.dispatchEvent('compile', {model: output, mtl: mtlOutput, images: materials});
		return options.all_files ? _obj_export : output;
	},
	write(content, path) {
		var scope = this;
		var mtl_path = path.replace(/\.obj$/, '.mtl')

		content = this.compile({mtl_name: pathToName(mtl_path, true)})
		if(shouldExportModel) Blockbench.writeFile(path, {content}, path => scope.afterSave(path));
		if(shouldExportMTL) Blockbench.writeFile(mtl_path, {content: _obj_export.mtl});

		for (var key in _obj_export.images) {
			var texture = _obj_export.images[key]
			if (texture && !texture.error) {
				var name = texture.name;
				if (name.substr(-4) !== '.png') { name += '.png'; }
				var image_path = path.split(osfs);
				image_path.splice(-1, 1, name);
				Blockbench.writeFile(image_path.join(osfs), {
					content: texture.source,
					savetype: 'image'
				})
			}
		}
	},
	export() {
		var scope = this;
		if (isApp) {
			if(shouldExportModel) Blockbench.export({ resource_id: 'obj', type: this.name, extensions: [this.extension], name: this.fileName(), custom_writer: (a, b) => scope.write(a, b) });
			if(shouldExportCollisions) Blockbench.export({ resource_id: 'collisions', type: 'COLLISIONS', extensions: ['collisions'], name: this.fileName(), content: this.compile(1) });
		} else {
			var archive = new JSZip();
			var content = this.compile()

			archive.file((Project.name||'model')+'.obj', content)
			archive.file('materials.mtl', _obj_export.mtl)

			for (var key in _obj_export.images) {
				var texture = _obj_export.images[key]
				if (texture && !texture.error && texture.mode === 'bitmap') archive.file(pathToName(texture.name) + '.png', texture.source.replace('data:image/png;base64,', ''), {base64: true});
			}
			archive.generateAsync({type: 'blob'}).then(content => Blockbench.export({ type: 'Zip Archive', extensions: ['zip'], name: 'assets', content: content, savetype: 'zip' }, path => scope.afterDownload(path)))
		}
	},
	load(file) {
		let {content} = file;
		let lines = content.split(/[\r\n]+/);

		function toVector(args, length) { return args.map(v => parseFloat(v)); }

		let mesh;
		let vertices = [];
		let vertex_keys = {};
		let vertex_textures = [];
		let vertex_normals = [];
		let meshes = [];
		let vector1 = new THREE.Vector3();
		let vector2 = new THREE.Vector3();
		let current_texture;

		Undo.initEdit({outliner: true, elements: meshes, selection: true});

		lines.forEach(line => {
			if (line.substr(0, 1) == '#' || !line) return;

			let args = line.split(/\s+/).filter(arg => typeof arg !== 'undefined' && arg !== '');
			let cmd = args.shift();

			if (['o', 'g'].includes(cmd) || (cmd == 'v' && !mesh)) {
				mesh = new Mesh({ name: ['o', 'g'].includes(cmd) ? args[0] : 'unknown', vertices: {} })
				vertex_keys = {};
				meshes.push(mesh);
			}
			if (cmd == 'v') vertices.push(toVector(args, 3).map(v => v * 16)); // Force scale to 16 (Default Blockbench scale)
			if (cmd == 'vt') vertex_textures.push(toVector(args, 2))
			if (cmd == 'vn') vertex_normals.push(toVector(args, 3))
			if (cmd == 'f') {
				let f = { vertices: [], vertex_textures: [], vertex_normals: [], }
				args.forEach((triplet, i) => {
					if (i >= 4) return;
					let [v, vt, vn] = triplet.split('/').map(v => parseInt(v));
					if (!vertex_keys[ v-1 ]) {
						vertex_keys[ v-1 ] = mesh.addVertices(vertices[v-1])[0];
					}
					f.vertices.push(vertex_keys[ v-1 ]);
					f.vertex_textures.push(vertex_textures[ vt-1 ]);
					f.vertex_normals.push(vertex_normals[ vn-1 ]);
				})
				
				let uv = {};
				f.vertex_textures.forEach((vt, i) => {
					let key = f.vertices[i];
					if (vt instanceof Array) uv[key] = [ vt[0] * Project.texture_width, (1-vt[1]) * Project.texture_width ];
					else uv[key] = [0, 0];
				})
				let face = new MeshFace(mesh, { vertices: f.vertices, uv, texture: current_texture })
				mesh.addFaces(face);

				if (f.vertex_normals.find(v => v)) {
					vector1.fromArray(face.getNormal());
					vector2.fromArray(f.vertex_normals[0]);
					let angle = vector1.angleTo(vector2);
					if (angle > Math.PI/2) face.invert();
				}
			}
		})
		meshes.forEach(mesh => mesh.init())

		Undo.finishEdit('Import OBJ');
	}
})

/**
 * Compile the animation to a JSON string
 * @param {*} animation The animation to compile
 * @returns The JSON string
 */
function compileAnimation(animation) {
	const animators = animation.animators;
	let objectForJson = { "loop": fixLoopMode(animation.loop), "startDelay": animation.startDelay, "timelines": [], "events": {} };

	for (let uuid in animators) {
		let animator = animators[uuid];
		let keyframes = animator.keyframes;
		
		if(animator instanceof BoneAnimator) {
			const hasGroup = animator.getGroup() != null;
			const origin = hasGroup ? {
				x: animator.getGroup().origin[0],
				y: animator.getGroup().origin[1],
				z: animator.getGroup().origin[2]
			} : { x: 0, y: 0, z: 0 };
			let object = {
				"objectName": hasGroup ? animator.getGroup().name : animator.name,
				"pivotPoint": origin,
				"parent": hasGroup ? animator.getGroup().parent.name : null,
			};
			let frames = new Map();

			/* Compile the keyframes */
			keyframes.forEach(kf => {
				let time = kf.getTimecodeString();
				if (!frames.has(time))
					frames.set(time, { "time": time });

				let frame = frames.get(time);
				switch (kf.channel) {
					case "position":
						frame.position = {
							x: kf.getArray()[0],
							y: kf.getArray()[1],
							z: kf.getArray()[2]
						}
						break;
					case "rotation":
						frame.rotation = {
							x: kf.getArray()[0],
							y: kf.getArray()[1],
							z: kf.getArray()[2]
						}
						break;
					case "scale":
						frame.scale = {
							x: kf.getArray()[0],
							y: kf.getArray()[1],
							z: kf.getArray()[2]
						}
						break;
				}
			});

			object.frames = Array.from(frames.values()); // Add the frames to the object
			objectForJson.timelines.push(object); // Add the object to the timelines
		} else // Add events
			keyframes.forEach(kf => {
				const time = kf.getTimecodeString();
				if (!objectForJson.events[time]) objectForJson.events[time] = [];
				objectForJson.events[time].push({ "type": kf.channel, "path": kf.data_points[0].effect, "locator": kf.data_points[0].locator, "volume": 1.0, "pitch": 1.0 });
			});
	}

	return JSON.stringify(objectForJson, null, '\t');
}

/* Entry point */
Plugin.register('animatedOBJ', { title: 'Kinetic Importer/Exporter', author: 'Niwer', icon: 'movie', version: '1.0.0', variant: 'both',
	description: 'This plugin allow you to import/export : OBJ (MTL optional), ANIM file, collisions/seats for JSON, and more...',
	onload() {
		exportButton = new Action('export_animobj', { name: 'Kinetic Data Export', icon: 'movie', description: 'Kinetic Data Exporter for Content-Packs', keybind: new Keybind({key: 'q', ctrl: true}),
			click: () => {
				const ANIMATIONS = Animation.all.slice();
				const HAS_ANIMATIONS = ANIMATIONS.length > 0;
				const MAIN_FORM = {
					exportMDL: {label: "Export Model", type: 'checkbox', value: false},
					exportMTL: {label: "Export MTL", type: 'checkbox', value: false},
					exportAnimation: {label: "Export Animation "+(HAS_ANIMATIONS?"":"(No animations in the project)"), type: 'checkbox', value: false},
					collisionsBox: {label: "Export Collisions", type: 'textarea', nowrite: true, readonly: true},
					seatsBox: {label: "Export Seats", type: 'textarea', nowrite: true, readonly: true}
				};
				const MAIN_DIALOG = new Dialog({ id: 'kinetic_export', title: 'Main Exporter', form: MAIN_FORM, width: 1400,
					onFormChange() { $('dialog#kinetic_export textarea').val(CODEC_OBJ.compile(1)).addClass('code'); },
					onConfirm(form_result) {
						MAIN_DIALOG.hide();
						if (form_result.exportMDL || form_result.exportCollisions) {
							shouldExportModel = form_result.exportMDL;
							shouldExportMTL = form_result.exportMTL;
							CODEC_OBJ.export();
						}

						/* Show animations dialog */
						if (form_result.exportAnimation && HAS_ANIMATIONS) {
							const ANIM_FORM = {};
							ANIMATIONS.forEach(animation => ANIM_FORM[animation.name.hashCode()] = {label: animation.name, type: 'checkbox', value: false});
							const ANIM_DIALOG = new Dialog({ id: 'animation_export', title: 'Animation Exporter', form: ANIM_FORM,
								onConfirm(anim_result) {
									ANIM_DIALOG.hide();
									const SELECTED_ANIMS = ANIMATIONS.filter(animation => anim_result[animation.name.hashCode()]);
									SELECTED_ANIMS.forEach(animation => Blockbench.export({ resource_id: 'animation', type: 'ANIM', extensions: ['anim'], name: animation.name, content: compileAnimation(animation) }));
								}
							});
							ANIM_DIALOG.show();
						}
					}
				});
				MAIN_DIALOG.show();
			}
		});
		seatsButton = new Action('seats_positions', { name: 'Setup Seats Positions', description: 'Setup the positions for all seats you want', keybind: new Keybind({key: 'a', ctrl: true}),
			click: () => {
				const SEATS_FORM = {
					seatID: {label: "Seat ID", type: 'number', step: '0.1'},
					x: {label: "X Position", type: 'number', step: '0.1'},
					y: {label: "Y Position", type: 'number', step: '0.1'},
					z: {label: "Z Position", type: 'number', step: '0.1'},
					rotation: {label: "Yaw Rotation", type: 'number', step: '0.1'}
				};
				const SEATS_DIALOG = new Dialog({ id: 'seats_positions', title: 'Seats Positions', form: SEATS_FORM, width: 540, singleButton: true, onConfirm() { SEATS_DIALOG.hide(); } });
				SEATS_DIALOG.show();
			}
		});

		/* Add buttons */
		MenuBar.addAction(exportButton, 'file.export');
		MenuBar.addAction(seatsButton, 'filter');

		/* Add CSS */
		Blockbench.addCSS(`dialog#kinetic_export textarea { tab-size: 40px; min-height: 250px; }`)

		Blockbench.addDragHandler("obj_drag_drop", { extensions: ['obj'] }, (files) => {
			for(file of files) CODEC_OBJ.load(file);
		});
	},
	onunload() {
		/* Remove buttons */
		exportButton.delete();
		seatsButton.delete();

		/* Remove drag handler */
		Blockbench.removeDragHandler("obj_drag_drop");
	}
});