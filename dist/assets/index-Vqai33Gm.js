//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
})();
//#endregion
//#region \0vite/preload-helper.js
var scriptRel = "modulepreload";
var assetsURL = function(dep, importerUrl) {
	return new URL(dep, importerUrl).href;
};
var seen = {};
var __vitePreload = function preload(baseModule, deps, importerUrl) {
	let promise = Promise.resolve();
	if (deps && deps.length > 0) {
		const links = document.getElementsByTagName("link");
		const cspNonceMeta = document.querySelector("meta[property=csp-nonce]");
		const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
		function allSettled(promises) {
			return Promise.all(promises.map((p) => Promise.resolve(p).then((value) => ({
				status: "fulfilled",
				value
			}), (reason) => ({
				status: "rejected",
				reason
			}))));
		}
		function importMetaResolve(specifier) {
			if (import.meta.resolve) return import.meta.resolve(specifier);
			return new URL(
				specifier,
				/** #__KEEP__ */
				import.meta.url
			).href;
		}
		promise = allSettled(deps.map((dep) => {
			dep = assetsURL(dep, importerUrl);
			dep = importMetaResolve(dep);
			if (dep in seen) return;
			seen[dep] = true;
			const isCss = dep.endsWith(".css");
			for (let i = links.length - 1; i >= 0; i--) {
				const link = links[i];
				if (link.href === dep && (!isCss || link.rel === "stylesheet")) return;
			}
			const link = document.createElement("link");
			link.rel = isCss ? "stylesheet" : scriptRel;
			if (!isCss) link.as = "script";
			link.crossOrigin = "";
			link.href = dep;
			if (cspNonce) link.setAttribute("nonce", cspNonce);
			document.head.appendChild(link);
			if (isCss) return new Promise((res, rej) => {
				link.addEventListener("load", res);
				link.addEventListener("error", () => rej(/* @__PURE__ */ new Error(`Unable to preload CSS for ${dep}`)));
			});
		}).filter((p) => p !== void 0));
	}
	function handlePreloadError(err) {
		const e = new Event("vite:preloadError", { cancelable: true });
		e.payload = err;
		window.dispatchEvent(e);
		if (!e.defaultPrevented) throw err;
	}
	return promise.then((res) => {
		for (const item of res || []) {
			if (item.status !== "rejected") continue;
			handlePreloadError(item.reason);
		}
		return baseModule().catch(handlePreloadError);
	});
};
//#endregion
//#region src/scene.js
var root = document.getElementById("christmas-credenza-tight-3d");
var stage = root.querySelector(".scene-stage");
var message = root.querySelector(".scene-message");
try {
	const THREE = await __vitePreload(() => import("./three.module-CKoFlWJe.js"), [], import.meta.url);
	const scene = new THREE.Scene();
	scene.background = new THREE.Color("#3b2619");
	const renderer = new THREE.WebGLRenderer({
		antialias: true,
		alpha: false,
		powerPreference: "high-performance"
	});
	renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.25;
	stage.appendChild(renderer.domElement);
	const camera = new THREE.PerspectiveCamera(36, 1.5, .02, 25);
	const target = new THREE.Vector3(.12, 1.28, 0);
	let yaw = -.055, pitch = .27, distance = 2.18;
	function placeCamera() {
		camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distance, target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * Math.cos(pitch) * distance);
		camera.lookAt(target);
	}
	placeCamera();
	let seed = 4468;
	function random() {
		seed = 1664525 * seed + 1013904223 >>> 0;
		return seed / 4294967296;
	}
	const V = (x, y, z) => new THREE.Vector3(x, y, z);
	const standard = (color, roughness = .5, metalness = 0) => new THREE.MeshStandardMaterial({
		color,
		roughness,
		metalness
	});
	function texture(draw, w = 512, h = 512) {
		const c = document.createElement("canvas");
		c.width = w;
		c.height = h;
		draw(c.getContext("2d"), w, h);
		const t = new THREE.CanvasTexture(c);
		t.colorSpace = THREE.SRGBColorSpace;
		t.anisotropy = 4;
		return t;
	}
	const woodMap = texture((c, w, h) => {
		c.fillStyle = "#854725";
		c.fillRect(0, 0, w, h);
		for (let i = 0; i < 1900; i++) {
			const y = random() * h;
			c.strokeStyle = random() < .5 ? "rgba(28,9,3,.13)" : "rgba(222,154,73,.1)";
			c.lineWidth = .4 + random() * 1.4;
			c.beginPath();
			c.moveTo(0, y);
			for (let x = 0; x <= w; x += 8) c.lineTo(x, y + Math.sin(x * .016 + y * .06) * 2 + Math.sin(x * .04 + y) * .5);
			c.stroke();
		}
		for (let i = 0; i < 220; i++) {
			c.strokeStyle = "rgba(39,13,4,.085)";
			c.lineWidth = .6;
			c.beginPath();
			let y = random() * h;
			c.moveTo(0, y);
			c.bezierCurveTo(w * .2, y + 12, w * .8, y - 8, w, y + 5);
			c.stroke();
		}
	}, 1024, 512);
	const wood = new THREE.MeshPhysicalMaterial({
		map: woodMap,
		color: "#dfb995",
		roughness: .34,
		metalness: .02,
		clearcoat: .45,
		clearcoatRoughness: .35
	});
	const darkWood = new THREE.MeshStandardMaterial({
		map: woodMap,
		color: "#704e38",
		roughness: .43
	});
	const verticalMap = woodMap.clone();
	verticalMap.rotation = Math.PI / 2;
	verticalMap.center.set(.5, .5);
	verticalMap.needsUpdate = true;
	const verticalWood = wood.clone();
	verticalWood.map = verticalMap;
	const black = standard("#151310", .46), dark = standard("#262320", .32), brass = standard("#9a7241", .3, .8), silver = standard("#b3aca1", .27, .77), darkMetal = standard("#393531", .45, .6);
	const screenSilver = standard("#c0bcb0", .26, .67);
	function mesh(g, m, parent = scene) {
		const o = new THREE.Mesh(g, m);
		o.castShadow = true;
		o.receiveShadow = true;
		parent.add(o);
		return o;
	}
	function box(w, h, d, x, y, z, m, parent = scene) {
		const o = mesh(new THREE.BoxGeometry(w, h, d), m, parent);
		o.position.set(x, y, z);
		return o;
	}
	function cylinder(rt, rb, h, x, y, z, m, parent = scene, n = 32) {
		const o = mesh(new THREE.CylinderGeometry(rt, rb, h, n), m, parent);
		o.position.set(x, y, z);
		return o;
	}
	function sphere(r, x, y, z, m, parent = scene) {
		const o = mesh(new THREE.SphereGeometry(r, 16, 10), m, parent);
		o.position.set(x, y, z);
		return o;
	}
	function rod(a, b, r, m, parent = scene) {
		const d = b.clone().sub(a);
		const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), m, parent);
		o.position.copy(a).add(b).multiplyScalar(.5);
		o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
		return o;
	}
	function roundedShape(w, h, r) {
		const s = new THREE.Shape();
		let x = -w / 2, y = -h / 2;
		s.moveTo(x + r, y);
		s.lineTo(x + w - r, y);
		s.quadraticCurveTo(x + w, y, x + w, y + r);
		s.lineTo(x + w, y + h - r);
		s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		s.lineTo(x + r, y + h);
		s.quadraticCurveTo(x, y + h, x, y + h - r);
		s.lineTo(x, y + r);
		s.quadraticCurveTo(x, y, x + r, y);
		return s;
	}
	function panel(w, h, r, d, x, y, z, m, parent = scene) {
		const o = mesh(new THREE.ExtrudeGeometry(roundedShape(w, h, r), {
			depth: d,
			bevelEnabled: true,
			bevelSegments: 2,
			steps: 1,
			bevelSize: .0025,
			bevelThickness: .0025,
			curveSegments: 12
		}), m, parent);
		o.position.set(x, y, z);
		return o;
	}
	const plasterMap = texture((c, w, h) => {
		c.fillStyle = "#bda17d";
		c.fillRect(0, 0, w, h);
		for (let i = 0; i < 35e3; i++) {
			const a = random() * .07;
			c.fillStyle = `rgba(${random() < .5 ? "0,0,0" : "255,255,255"},${a})`;
			c.fillRect(random() * w, random() * h, 1 + random() * 2, 1);
		}
	}, 512, 512);
	plasterMap.wrapS = plasterMap.wrapT = THREE.RepeatWrapping;
	plasterMap.repeat.set(5, 3);
	box(12, 6, .05, 0, 2, -.55, new THREE.MeshStandardMaterial({
		color: "#d2baa0",
		map: plasterMap,
		bumpMap: plasterMap,
		bumpScale: .003,
		roughness: 1
	}));
	box(12, .05, 8, 0, -.03, 2, wood);
	box(12, .12, .03, 0, .04, -.5, darkWood);
	const topY = .94;
	box(2.14, .045, .9, 0, .9175, 0, wood);
	box(2.1, .74, .85, 0, .545, 0, darkWood);
	box(1.95, .095, .68, 0, .105, -.015, darkWood);
	for (const x of [-.78, .78]) box(.045, .16, .77, x, .105, 0, darkWood);
	function front(w, h, x, y, handle = true, vertical = false) {
		box(w, h, .035, x, y, .433, verticalWood);
		if (handle) {
			const hw = vertical ? .018 : .102, hh = vertical ? .112 : .018;
			box(hw + .017, hh + .013, .007, x, y, .454, black);
			box(hw, hh, .009, x, y - .002, .455, darkWood);
			box(hw, .003, .009, x, y - hh / 2, .461, wood);
		}
	}
	front(.69, .138, -.69, .835);
	front(1.374, .138, .355, .835, false);
	for (const x of [.006, .697]) {
		box(.112, .025, .008, x, .835, .454, black);
		box(.097, .015, .011, x, .832, .458, darkWood);
	}
	front(.337, .596, -.867, .451, false);
	front(.337, .596, -.518, .451, false);
	for (const x of [-.72, -.655]) {
		box(.03, .14, .009, x, .475, .455, black);
		box(.014, .119, .011, x, .475, .46, darkWood);
	}
	for (const x of [.006, .697]) for (const y of [
		.681,
		.48,
		.279
	]) front(.678, .191, x, y);
	for (const y of [.916, .159]) box(2.13, .021, .031, 0, y, .454, darkWood);
	for (const x of [-1.056, 1.056]) box(.021, .78, .031, x, .534, .454, darkWood);
	const trimMat = standard("#a17245", .6);
	const trimGeo = new THREE.BoxGeometry(.008, .012, .002);
	const trim = new THREE.InstancedMesh(trimGeo, trimMat, 134);
	let ti = 0;
	const dummy = new THREE.Object3D();
	for (const y of [.159]) for (let i = 0; i < 106; i++) {
		dummy.position.set(-1.05 + i * .02, y, .471);
		dummy.rotation.z = i % 2 ? 0 : Math.PI / 2;
		dummy.updateMatrix();
		trim.setMatrixAt(ti++, dummy.matrix);
	}
	for (const x of [-1.056, 1.056]) for (let i = 0; i < 14; i++) {
		dummy.position.set(x, .2 + i * .052, .471);
		dummy.rotation.z = Math.PI / 2;
		dummy.updateMatrix();
		trim.setMatrixAt(ti++, dummy.matrix);
	}
	scene.add(trim);
	const tv = new THREE.Group();
	scene.add(tv);
	tv.position.set(.17, .987, -.025);
	box(.91, .66, .415, 0, .33, -.035, wood, tv);
	box(.88, .615, .015, 0, .326, -.25, black, tv);
	for (const x of [-.33, .33]) box(.09, .032, .28, x, -.024, -.015, black, tv);
	panel(.891, .637, .012, .017, 0, .33, .179, darkWood, tv);
	panel(.864, .613, .01, .009, 0, .33, .199, screenSilver, tv);
	panel(.815, .57, .011, .008, -.011, .33, .212, black, tv);
	panel(.648, .561, .027, .009, -.081, .33, .227, screenSilver, tv);
	panel(.627, .54, .028, .012, -.083, .33, .238, dark, tv);
	panel(.596, .508, .057, .009, -.083, .33, .252, black, tv);
	const glassMap = texture((c, w, h) => {
		const g = c.createRadialGradient(w * .37, h * .32, 15, w * .5, h * .5, w * .6);
		g.addColorStop(0, "#acb0a8");
		g.addColorStop(.55, "#989e98");
		g.addColorStop(1, "#656d68");
		c.fillStyle = g;
		c.fillRect(0, 0, w, h);
		const sheen = c.createLinearGradient(0, 0, w, h);
		sheen.addColorStop(0, "rgba(255,248,223,.15)");
		sheen.addColorStop(.4, "rgba(255,248,223,0)");
		sheen.addColorStop(1, "rgba(30,35,38,.06)");
		c.fillStyle = sheen;
		c.fillRect(0, 0, w, h);
		c.fillStyle = "rgba(249,215,151,.10)";
		c.beginPath();
		c.moveTo(65, 70);
		c.lineTo(110, 65);
		c.lineTo(126, 156);
		c.lineTo(59, 159);
		c.closePath();
		c.fill();
	}, 512, 384);
	const glassMat = new THREE.MeshPhysicalMaterial({
		map: glassMap,
		color: "#c7ccbf",
		roughness: .17,
		metalness: .13,
		clearcoat: 1,
		clearcoatRoughness: .08,
		envMapIntensity: .24
	});
	const sg = new THREE.PlaneGeometry(.567, .475, 48, 40);
	const pos = sg.attributes.position, uv = sg.attributes.uv;
	for (let i = 0; i < pos.count; i++) {
		const u = (uv.getX(i) - .5) * 2, v = (uv.getY(i) - .5) * 2;
		const sx = Math.sign(u) * Math.pow(Math.abs(u), .7), sy = Math.sign(v) * Math.pow(Math.abs(v), .7);
		pos.setXYZ(i, sx * .2835 * (1 - .045 * Math.pow(Math.abs(v), 8)), sy * .2375 * (1 - .055 * Math.pow(Math.abs(u), 8)), .014 * (1 - u * u) * (1 - v * v));
	}
	sg.computeVertexNormals();
	const glass = mesh(sg, glassMat, tv);
	glass.position.set(-.083, .33, .268);
	const grilleMap = texture((c, w, h) => {
		c.fillStyle = "#413329";
		c.fillRect(0, 0, w, h);
		for (let x = 4; x < w; x += 9) for (let y = 4; y < h; y += 9) {
			c.fillStyle = "#161411";
			c.beginPath();
			c.arc(x + (y % 18 === 4 ? 0 : 3), y, 2.3, 0, Math.PI * 2);
			c.fill();
			c.fillStyle = "rgba(170,143,100,.20)";
			c.fillRect(x - 1, y + 2, 3, 1);
		}
	}, 128, 384);
	const grille = new THREE.MeshStandardMaterial({
		map: grilleMap,
		roughness: .8
	});
	box(.134, .505, .014, .337, .33, .231, darkWood, tv);
	box(.119, .206, .003, .337, .176, .242, grille, tv);
	box(.119, .052, .003, .337, .571, .242, grille, tv);
	panel(.117, .222, .004, .007, .337, .411, .241, silver, tv);
	box(.106, .211, .005, .337, .411, .252, black, tv);
	for (const y of [.47, .365]) {
		const ring = cylinder(.035, .035, .01, .337, y, .263, silver, tv, 40);
		ring.rotation.x = Math.PI / 2;
		const dial = cylinder(.027, .027, .017, .337, y, .273, darkMetal, tv, 40);
		dial.rotation.x = Math.PI / 2;
		const bar = box(.008, .05, .008, .337, y, .285, silver, tv);
		bar.rotation.z = -.4;
		for (let i = 0; i < 16; i++) {
			const a = i / 16 * Math.PI * 2;
			const tick = box(.001, .005, .001, .337 + Math.sin(a) * .039, y + Math.cos(a) * .039, .258, screenSilver, tv);
			tick.rotation.z = -a;
		}
	}
	for (let i = 0; i < 3; i++) {
		const m = standard([
			"#70a8af",
			"#91a260",
			"#ad5d48"
		][i], .3, .25);
		const bt = cylinder(.006, .006, .005, .3 + i * .038, .283, .256, m, tv, 14);
		bt.rotation.x = Math.PI / 2;
	}
	function textPlane(text, w, h, color, bg, parent, x, y, z) {
		const map = texture((c, cw, ch) => {
			if (bg) {
				c.fillStyle = bg;
				c.fillRect(0, 0, cw, ch);
			}
			c.fillStyle = color;
			c.font = `500 ${ch * .6}px Georgia, serif`;
			c.textAlign = "center";
			c.textBaseline = "middle";
			c.fillText(text, cw / 2, ch / 2);
		}, 512, 96);
		const m = new THREE.MeshBasicMaterial({
			map,
			transparent: !bg,
			depthWrite: false
		});
		const o = mesh(new THREE.PlaneGeometry(w, h), m, parent);
		o.position.set(x, y, z);
		o.castShadow = false;
		return o;
	}
	textPlane("VHF", .022, .008, "#c2b8a3", null, tv, .306, .51, .262);
	textPlane("UHF", .022, .008, "#c2b8a3", null, tv, .306, .405, .262);
	const lamp = new THREE.Group();
	lamp.position.set(-.755, topY, -.015);
	scene.add(lamp);
	cylinder(.093, .095, .014, 0, .009, 0, brass, lamp);
	const ceramicMap = texture((c, w, h) => {
		c.fillStyle = "#493522";
		c.fillRect(0, 0, w, h);
		for (let i = 0; i < 15e3; i++) {
			c.fillStyle = random() < .4 ? "rgba(199,148,60,.28)" : "rgba(20,15,13,.25)";
			c.beginPath();
			c.arc(random() * w, random() * h, random() * 2, 0, 7);
			c.fill();
		}
	}, 256, 256);
	const ceramic = new THREE.MeshPhysicalMaterial({
		map: ceramicMap,
		color: "#c4a075",
		roughness: .29,
		clearcoat: .9,
		metalness: .08
	});
	const profile = [
		[.049, .016],
		[.075, .027],
		[.091, .071],
		[.088, .125],
		[.064, .18],
		[.034, .21],
		[.025, .246],
		[.038, .26]
	].map((p) => new THREE.Vector2(...p));
	mesh(new THREE.LatheGeometry(profile, 40), ceramic, lamp);
	cylinder(.011, .011, .08, 0, .294, 0, brass, lamp);
	const linen = texture((c, w, h) => {
		c.fillStyle = "#d2b482";
		c.fillRect(0, 0, w, h);
		for (let x = 0; x < w; x++) {
			c.strokeStyle = `rgba(78,48,14,${.025 + random() * .1})`;
			c.beginPath();
			c.moveTo(x, 0);
			c.lineTo(x, h);
			c.stroke();
		}
		for (let y = 0; y < h; y += 2) {
			c.fillStyle = "rgba(255,242,201,.07)";
			c.fillRect(0, y, w, 1);
		}
	}, 256, 256);
	const shade = cylinder(.145, .205, .3, 0, .485, 0, new THREE.MeshStandardMaterial({
		map: linen,
		color: "#ffdd9a",
		emissive: "#ffad43",
		emissiveIntensity: .47,
		roughness: 1,
		side: THREE.DoubleSide
	}), lamp, 64);
	shade.geometry.dispose();
	shade.geometry = new THREE.CylinderGeometry(.145, .205, .3, 64, 1, true);
	shade.castShadow = false;
	for (const [y, r] of [[.335, .205], [.635, .145]]) {
		const tor = mesh(new THREE.TorusGeometry(r, .003, 6, 64), brass, lamp);
		tor.rotation.x = Math.PI / 2;
		tor.position.y = y;
		tor.castShadow = false;
	}
	sphere(.012, 0, .662, 0, brass, lamp);
	const bulb = sphere(.025, 0, .455, 0, new THREE.MeshBasicMaterial({ color: "#fff0c7" }), lamp);
	bulb.scale.y = 1.3;
	const lamplight = new THREE.PointLight("#ffb750", 3.5, 4, 2);
	lamplight.position.set(-.755, 1.38, -.015);
	scene.add(lamplight);
	lamplight.castShadow = true;
	lamplight.shadow.mapSize.set(1024, 1024);
	lamplight.shadow.bias = -7e-4;
	lamplight.shadow.normalBias = .01;
	lamplight.shadow.radius = 3;
	const wash = new THREE.PointLight("#ffc370", 1.1, 3, 2);
	wash.position.set(-.68, 1.63, -.32);
	scene.add(wash);
	const loopA = .666, loopR = .331, trackY = .957;
	const loopLength = 4 * loopA + 2 * Math.PI * loopR;
	function trackAt(s, offset = 0) {
		s = (s % loopLength + loopLength) % loopLength;
		const r = loopR + offset;
		let x, z, dx, dz;
		if (s < 2 * loopA) {
			x = loopA - s;
			z = r;
			dx = -1;
			dz = 0;
		} else if (s < 2 * loopA + Math.PI * loopR) {
			const a = (s - 2 * loopA) / loopR;
			x = -.666 - r * Math.sin(a);
			z = r * Math.cos(a);
			dx = -Math.cos(a);
			dz = -Math.sin(a);
		} else if (s < 4 * loopA + Math.PI * loopR) {
			x = -.666 + s - (2 * loopA + Math.PI * loopR);
			z = -r;
			dx = 1;
			dz = 0;
		} else {
			const a = (s - (4 * loopA + Math.PI * loopR)) / loopR;
			x = loopA + r * Math.sin(a);
			z = -r * Math.cos(a);
			dx = Math.cos(a);
			dz = Math.sin(a);
		}
		return {
			x,
			z,
			angle: Math.atan2(-dz, dx)
		};
	}
	const tieCount = 240;
	const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(.009, .007, .044), standard("#49352b", .88), tieCount);
	ties.castShadow = true;
	ties.receiveShadow = true;
	for (let i = 0; i < tieCount; i++) {
		const p = trackAt(i / tieCount * loopLength);
		dummy.position.set(p.x, .946, p.z);
		dummy.rotation.set(0, p.angle, 0);
		dummy.updateMatrix();
		ties.setMatrixAt(i, dummy.matrix);
	}
	scene.add(ties);
	for (const offset of [-.014, .014]) {
		const pts = [];
		for (let i = 0; i <= 500; i++) {
			const p = trackAt(i / 500 * loopLength, offset);
			pts.push(V(p.x, trackY, p.z));
		}
		const rail = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 500, .0025, 6, false), silver);
		rail.castShadow = false;
	}
	const trainBlue = new THREE.MeshPhysicalMaterial({
		color: "#126290",
		roughness: .32,
		metalness: .3,
		clearcoat: .5
	});
	const trainRed = standard("#ba3024", .38, .34), gold = standard("#d1b05e", .42, .5);
	const trainPieces = [], wheels = [];
	function trainGroup(offset) {
		const g = new THREE.Group();
		scene.add(g);
		trainPieces.push({
			g,
			offset
		});
		return g;
	}
	function wheel(g, x, y, z, r, red = false) {
		const hub = new THREE.Group();
		hub.position.set(x, y, z);
		g.add(hub);
		const tire = cylinder(r, r, .008, 0, 0, 0, darkMetal, hub, 20);
		tire.rotation.x = Math.PI / 2;
		const disc = cylinder(r * .84, r * .84, .009, 0, 0, 0, red ? trainRed : black, hub, 20);
		disc.rotation.x = Math.PI / 2;
		if (red) {
			for (let k = 0; k < 12; k++) {
				const a = k * Math.PI / 6;
				rod(V(0, 0, z < 0 ? -.006 : .006), V(Math.sin(a) * r * .78, Math.cos(a) * r * .78, z < 0 ? -.006 : .006), .001, gold, hub);
			}
			sphere(.003, 0, 0, z < 0 ? -.007 : .007, silver, hub);
		}
		wheels.push({
			hub,
			r
		});
	}
	const engine = trainGroup(0);
	box(.255, .015, .053, 0, .04, 0, black, engine);
	const sections = [
		[
			-.133,
			.055,
			.019
		],
		[
			-.117,
			.08,
			.025
		],
		[
			-.075,
			.108,
			.03
		],
		[
			.057,
			.107,
			.03
		],
		[
			.085,
			.098,
			.029
		]
	];
	const vertices = [], indices = [], radial = 20;
	for (const [x, h, r] of sections) for (let i = 0; i <= radial; i++) {
		const a = i / radial * Math.PI;
		vertices.push(x, .049 + Math.sin(a) * (h - .049), Math.cos(a) * r);
	}
	for (let j = 0; j < sections.length - 1; j++) for (let i = 0; i < radial; i++) {
		const a = j * 21 + i, b = a + radial + 1;
		indices.push(a, b, a + 1, b, b + 1, a + 1);
	}
	const bodyG = new THREE.BufferGeometry();
	bodyG.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
	bodyG.setIndex(indices);
	bodyG.computeVertexNormals();
	mesh(bodyG, trainBlue, engine);
	box(.224, .021, .058, -.011, .052, 0, trainBlue, engine);
	const nose = mesh(new THREE.SphereGeometry(1, 20, 12), trainBlue, engine);
	nose.position.set(-.124, .053, 0);
	nose.scale.set(.023, .016, .026);
	box(.044, .067, .061, .105, .075, 0, trainBlue, engine);
	box(.051, .006, .065, .106, .111, 0, black, engine);
	for (const z of [-.031, .031]) {
		box(.019, .021, .001, .105, .093, z, black, engine);
		box(.002, .021, .002, .105, .093, z, silver, engine);
	}
	cylinder(.008, .01, .009, -.08, .11, 0, black, engine, 18);
	for (const z of [-.016, .016]) {
		for (const x of [
			-.04,
			.011,
			.06
		]) wheel(engine, x, .037, z, .025, true);
		for (const x of [-.111, -.085]) wheel(engine, x, .023, z, .012);
		wheel(engine, .116, .022, z, .011);
		rod(V(-.04, .036, z * 1.25), V(.061, .036, z * 1.25), .002, silver, engine);
		rod(V(-.09, .04, z * 1.25), V(.03, .035, z * 1.25), .0017, silver, engine);
		rod(V(-.107, .058, Math.sign(z) * .031), V(.078, .058, Math.sign(z) * .031), 65e-5, gold, engine);
	}
	for (const z of [-.032, .032]) {
		const plate = textPlane("MALLARD", .039, .007, "#dfc986", "#172c3a", engine, -.057, .08, z);
		if (z < 0) plate.rotation.y = Math.PI;
		const num = textPlane("4468", .024, .009, "#e3cf8e", null, engine, .104, .063, z);
		if (z < 0) num.rotation.y = Math.PI;
	}
	for (const z of [-.02, .02]) {
		const b = cylinder(.004, .004, .006, -.15, .038, z, silver, engine, 12);
		b.rotation.z = Math.PI / 2;
	}
	const tender = trainGroup(.21);
	box(.133, .054, .058, 0, .06, 0, trainBlue, tender);
	box(.143, .013, .061, 0, .029, 0, black, tender);
	box(.113, .007, .042, 0, .09, 0, black, tender);
	const coalMat = standard("#141615", .94);
	for (let i = 0; i < 45; i++) sphere(.003 + random() * .004, (random() - .5) * .108, .094 + random() * .004, (random() - .5) * .035, coalMat, tender);
	for (const z of [-.031, .031]) {
		const txt = textPlane("L N E R", .095, .013, "#e3cf8e", null, tender, 0, .062, z);
		if (z < 0) txt.rotation.y = Math.PI;
		for (const x of [
			-.044,
			0,
			.044
		]) wheel(tender, x, .021, Math.sign(z) * .016, .011);
	}
	function coach(offset) {
		const g = trainGroup(offset), body = standard("#52231b", .45, .1), cream = standard("#d4bc86", .48), roof = standard("#343432", .65);
		box(.25, .056, .065, 0, .058, 0, body, g);
		box(.251, .026, .066, 0, .071, 0, cream, g);
		box(.256, .007, .067, 0, .03, 0, black, g);
		const roofMesh = cylinder(.036, .036, .255, 0, .089, 0, roof, g, 24);
		roofMesh.rotation.z = Math.PI / 2;
		roofMesh.scale.z = .98;
		roofMesh.scale.x = .4;
		const windowMat = new THREE.MeshStandardMaterial({
			color: "#423c2b",
			emissive: "#eaa843",
			emissiveIntensity: .35,
			roughness: .22,
			metalness: .2
		});
		for (const z of [-.034, .034]) {
			for (let i = 0; i < 9; i++) {
				box(.018, .02, .001, -.104 + i * .026, .072, z, windowMat, g);
				box(.001, .02, .001, -.104 + i * .026, .072, z + (z > 0 ? .001 : -.001), brass, g);
			}
			for (const x of [
				-.08,
				-.058,
				.058,
				.08
			]) wheel(g, x, .018, Math.sign(z) * .016, .009);
		}
		return g;
	}
	coach(.429);
	coach(.709);
	let trainS = 1.045, runTrain = false;
	function placeTrain() {
		for (const { g, offset } of trainPieces) {
			const p = trackAt(trainS - offset);
			g.position.set(p.x, .959, p.z);
			g.rotation.y = p.angle + Math.PI;
		}
	}
	placeTrain();
	const tree = new THREE.Group();
	scene.add(tree);
	tree.position.set(1.3, .1, -.025);
	cylinder(.045, .095, 1.8, 0, .9, 0, standard("#342615", .95), tree, 12);
	cylinder(.22, .26, .09, 0, .035, 0, standard("#26251e", .58, .35), tree, 32);
	const branchPositions = [], needlePositions = [], needleColors = [];
	function addNeedle(a, b, col) {
		needlePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
		needleColors.push(col.r, col.g, col.b, col.r * .66, col.g * .78, col.b * .65);
	}
	const greens = [
		"#203a24",
		"#24452c",
		"#315331",
		"#17361f",
		"#3e5b33"
	].map((c) => new THREE.Color(c));
	const branchMat = standard("#293723", .94);
	const foliageGeo = new THREE.ConeGeometry(1, 1, 5, 1);
	const foliage = new THREE.InstancedMesh(foliageGeo, new THREE.MeshStandardMaterial({
		color: "#ffffff",
		roughness: 1
	}), 2100);
	let fi = 0;
	for (let level = 0; level < 25; level++) {
		const y = .22 + level * .084, reach = .53 * Math.pow(1 - level / 27, .78), count = 14;
		for (let b = 0; b < count; b++) {
			const a = b / count * Math.PI * 2 + level * 1.84 + random() * .3;
			const r = reach * (.76 + random() * .24), end = V(Math.cos(a) * r, y - .09, Math.sin(a) * r), start = V(0, y + .015, 0);
			rod(start, end, .0025, branchMat, tree);
			for (let k = 0; k < 6; k++) {
				const t = .17 + k * .135, center = start.clone().lerp(end, t);
				const sideAngle = a + (k % 2 ? 1 : -1) * .6;
				const len = .15 * (1 - level / 31) * (1 - t * .5), dir = V(Math.cos(sideAngle), .3, Math.sin(sideAngle)).normalize();
				if (k === 5) branchPositions.push(center.clone().addScaledVector(dir, len * .82));
				dummy.position.copy(center).addScaledVector(dir, len * .35);
				dummy.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
				dummy.scale.set(.035 * (1 - level / 31), len, .035 * (1 - level / 31));
				dummy.updateMatrix();
				foliage.setMatrixAt(fi, dummy.matrix);
				foliage.setColorAt(fi, greens[(b + k + level) % greens.length]);
				fi++;
				for (let n = 0; n < 18; n++) {
					const q = random(), p = center.clone().addScaledVector(dir, q * len), ang = random() * Math.PI * 2;
					const nDir = V(Math.cos(ang) * .7, .7 + random() * .3, Math.sin(ang) * .7).normalize();
					addNeedle(p, p.clone().addScaledVector(nDir, .022 + random() * .016), greens[(n + k) % greens.length]);
				}
			}
		}
	}
	foliage.count = fi;
	foliage.receiveShadow = true;
	foliage.castShadow = true;
	tree.add(foliage);
	const needleGeo = new THREE.BufferGeometry();
	needleGeo.setAttribute("position", new THREE.Float32BufferAttribute(needlePositions, 3));
	needleGeo.setAttribute("color", new THREE.Float32BufferAttribute(needleColors, 3));
	tree.add(new THREE.LineSegments(needleGeo, new THREE.LineBasicMaterial({
		vertexColors: true,
		transparent: true,
		opacity: .82
	})));
	const glowMap = texture((c, w, h) => {
		const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
		g.addColorStop(0, "rgba(255,255,255,1)");
		g.addColorStop(.08, "rgba(255,255,255,.95)");
		g.addColorStop(.2, "rgba(255,255,255,.40)");
		g.addColorStop(.45, "rgba(255,255,255,.10)");
		g.addColorStop(.72, "rgba(255,255,255,.025)");
		g.addColorStop(1, "rgba(255,255,255,0)");
		c.fillStyle = g;
		c.fillRect(0, 0, w, h);
	}, 128, 128);
	const bulbColors = [
		"#e53925",
		"#ed832c",
		"#e7b83e",
		"#339458",
		"#396dbc"
	];
	const lightMaterials = bulbColors.map((color) => new THREE.MeshBasicMaterial({
		color: new THREE.Color(color).multiplyScalar(1.9),
		toneMapped: false
	}));
	const spriteMaterials = bulbColors.map((color) => new THREE.SpriteMaterial({
		map: glowMap,
		color: new THREE.Color(color).multiplyScalar(1.12),
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
		opacity: .95
	}));
	const wirePts = [];
	function tightWrapRadius(y, angle) {
		const nearby = branchPositions.map((p) => {
			const theta = Math.atan2(p.x, p.z);
			const da = Math.atan2(Math.sin(theta - angle), Math.cos(theta - angle));
			return {
				radius: Math.hypot(p.x, p.z),
				distance: Math.hypot((p.y - y) * 1.6, da * .18)
			};
		}).sort((a, b) => a.distance - b.distance).slice(0, 5);
		let weightedRadius = 0, totalWeight = 0;
		for (const p of nearby) {
			const weight = 1 / (p.distance * p.distance + 3e-4);
			weightedRadius += p.radius * weight;
			totalWeight += weight;
		}
		return Math.max(.02, weightedRadius / totalWeight - .006);
	}
	for (let i = 0; i <= 144; i++) {
		const t = i / 144, envelope = Math.sin(Math.PI * t);
		const a = t * Math.PI * 2 * 8.2 + .39 * Math.sin(t * 24 + 1.1) + .16 * Math.sin(t * 83);
		const unevenPass = envelope * (.043 * Math.sin(a * 1.65 + .7) + .014 * Math.sin(a * 3.6) + .004 * (random() - .5));
		const y = .24 + t * 1.95 + unevenPass;
		const r = tightWrapRadius(y, a);
		wirePts.push(V(Math.sin(a) * r, y, Math.cos(a) * r));
	}
	const wireCurve = new THREE.CatmullRomCurve3(wirePts, false, "centripetal");
	wireCurve.arcLengthDivisions = 1800;
	const wire = mesh(new THREE.TubeGeometry(wireCurve, 900, .0016, 4, false), standard("#263422", 1), tree);
	wire.castShadow = false;
	const bulbProfile = [
		[0, 0],
		[.0044, 0],
		[.0062, .003],
		[.0085, .012],
		[.0074, .021],
		[.0044, .028],
		[.0015, .032],
		[0, .033]
	].map((p) => new THREE.Vector2(...p));
	const bulbGeometry = new THREE.LatheGeometry(bulbProfile, 16);
	const socketGeometry = new THREE.CylinderGeometry(.0046, .0046, .01, 10);
	const socketMaterial = standard("#26352a", .85);
	for (let i = 0; i < 155; i++) {
		const u = (i + .16 + random() * .68) / 155, p = wireCurve.getPointAt(u);
		const ci = Math.floor(random() * bulbColors.length);
		const angle = Math.atan2(p.x, p.z) + (random() - .5) * 2.8;
		const direction = V(Math.sin(angle), random() * 2 - 1, Math.cos(angle)).normalize();
		const assembly = new THREE.Group();
		assembly.name = "Vintage Christmas bulb";
		assembly.position.copy(p);
		assembly.quaternion.setFromUnitVectors(V(0, 1, 0), direction);
		tree.add(assembly);
		const socket = mesh(socketGeometry, socketMaterial, assembly);
		socket.position.y = -.004;
		socket.castShadow = false;
		const o = mesh(bulbGeometry, lightMaterials[ci], assembly);
		o.castShadow = false;
		o.receiveShadow = false;
		const center = p.clone().addScaledVector(direction, .016);
		const sp = new THREE.Sprite(spriteMaterials[ci]);
		sp.position.copy(center);
		const halo = .155 + random() * .028;
		sp.scale.set(halo, halo, 1);
		tree.add(sp);
		if (i % 17 === 0) {
			const pl = new THREE.PointLight(bulbColors[ci], .16, .8, 2);
			pl.position.copy(center);
			tree.add(pl);
		}
	}
	scene.add(new THREE.HemisphereLight("#d9c5a8", "#6b3920", .65));
	const key = new THREE.DirectionalLight("#ffe1ae", 1.15);
	key.position.set(-1.5, 3.4, 3.3);
	scene.add(key);
	key.castShadow = true;
	key.shadow.mapSize.set(2048, 2048);
	key.shadow.camera.left = -2.5;
	key.shadow.camera.right = 2.5;
	key.shadow.camera.top = 3;
	key.shadow.camera.bottom = -1;
	key.shadow.camera.near = .1;
	key.shadow.camera.far = 9;
	key.shadow.bias = -6e-4;
	key.shadow.normalBias = .008;
	key.shadow.radius = 4;
	const fill = new THREE.DirectionalLight("#bac6da", .3);
	fill.position.set(1, 2, 4);
	scene.add(fill);
	const capture = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
	const cubeCam = new THREE.CubeCamera(.04, 8, capture);
	cubeCam.position.set(.12, 1.34, .38);
	scene.add(cubeCam);
	glass.visible = false;
	cubeCam.update(renderer, scene);
	glass.visible = true;
	const pmrem = new THREE.PMREMGenerator(renderer);
	const env = pmrem.fromCubemap(capture.texture);
	glassMat.envMap = env.texture;
	wood.envMap = env.texture;
	wood.envMapIntensity = .14;
	ceramic.envMap = env.texture;
	ceramic.envMapIntensity = .2;
	silver.envMap = env.texture;
	silver.envMapIntensity = .36;
	trainBlue.envMap = env.texture;
	trainBlue.envMapIntensity = .25;
	pmrem.dispose();
	capture.dispose();
	scene.remove(cubeCam);
	let requested = false;
	function render() {
		requested = false;
		renderer.render(scene, camera);
	}
	function invalidate() {
		if (!requested) {
			requested = true;
			requestAnimationFrame(render);
		}
	}
	function resize() {
		const w = stage.clientWidth, h = stage.clientHeight;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		invalidate();
	}
	new ResizeObserver(resize).observe(stage);
	resize();
	const pointers = /* @__PURE__ */ new Map();
	let previousGap = 0;
	renderer.domElement.addEventListener("pointerdown", (e) => {
		pointers.set(e.pointerId, {
			x: e.clientX,
			y: e.clientY
		});
		renderer.domElement.setPointerCapture(e.pointerId);
		previousGap = 0;
	});
	renderer.domElement.addEventListener("pointermove", (e) => {
		const p = pointers.get(e.pointerId);
		if (!p) return;
		const dx = e.clientX - p.x, dy = e.clientY - p.y;
		pointers.set(e.pointerId, {
			x: e.clientX,
			y: e.clientY
		});
		if (pointers.size === 1) {
			yaw -= dx * .004;
			pitch = Math.max(.05, Math.min(.92, pitch + dy * .003));
			yaw = Math.max(-1.1, Math.min(1.1, yaw));
		} else {
			const ps = [...pointers.values()];
			const gap = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
			if (previousGap) distance = Math.max(1.7, Math.min(4.8, distance * previousGap / gap));
			previousGap = gap;
		}
		placeCamera();
		invalidate();
	});
	for (const ev of ["pointerup", "pointercancel"]) renderer.domElement.addEventListener(ev, (e) => {
		pointers.delete(e.pointerId);
		previousGap = 0;
	});
	renderer.domElement.addEventListener("wheel", (e) => {
		e.preventDefault();
		distance = Math.max(1.7, Math.min(4.8, distance * Math.exp(e.deltaY * .001)));
		placeCamera();
		invalidate();
	}, { passive: false });
	let prevTime = 0;
	function animate(t) {
		if (!runTrain || !root.isConnected) {
			prevTime = 0;
			return;
		}
		const dt = prevTime ? Math.min((t - prevTime) / 1e3, .05) : 0;
		prevTime = t;
		trainS += dt * .11;
		placeTrain();
		for (const w of wheels) w.hub.rotation.z += dt * .11 / w.r;
		render();
		requestAnimationFrame(animate);
	}
	const trainButton = root.querySelector("[data-action=\"train\"]");
	trainButton.addEventListener("click", () => {
		runTrain = !runTrain;
		trainButton.textContent = runTrain ? "Pause train" : "Run train";
		trainButton.setAttribute("aria-pressed", String(runTrain));
		if (runTrain) requestAnimationFrame(animate);
	});
	renderer.domElement.addEventListener("webglcontextlost", (e) => {
		e.preventDefault();
		runTrain = false;
		message.hidden = false;
		message.textContent = "The 3D view lost its graphics connection. Reload to restore the scene.";
	});
	message.hidden = true;
	root.dataset.ready = "true";
} catch (error) {
	message.hidden = false;
	message.textContent = "The 3D scene could not start. It needs WebGL and access to the Three.js CDN.";
	console.error(error);
}
//#endregion
