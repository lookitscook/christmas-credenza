import { $ as Color, At as DataTexture, Es as WebGLRenderTarget, Gr as Mesh, On as HalfFloatType, Ui as PlaneGeometry, Va as RawShaderMaterial, Vr as MathUtils, W as Camera, Wo as TextureLoader, Xa as RepeatWrapping, Zr as MeshNormalMaterial, cs as UnsignedByteType, hs as Vector2, io as Scene } from "./three.module-BlVsInPO.js";
//#region src/cross-hatch.js
var HATCH_DEFAULTS = Object.freeze({
	scale: 1.5,
	thickness: 1,
	contour: 4,
	cyan: 1,
	magenta: 1,
	yellow: 1,
	black: .2,
	inkColor: "#000000",
	paper: "Parchment"
});
var HATCH_SLIDERS = Object.freeze([
	{
		key: "scale",
		label: "Scale",
		min: .1,
		max: 2
	},
	{
		key: "thickness",
		label: "Thickness",
		min: 0,
		max: 3
	},
	{
		key: "contour",
		label: "Contour",
		min: 0,
		max: 10
	},
	{
		key: "cyan",
		label: "Cyan",
		min: 0,
		max: 1
	},
	{
		key: "magenta",
		label: "Magenta",
		min: 0,
		max: 1
	},
	{
		key: "yellow",
		label: "Yellow",
		min: 0,
		max: 1
	},
	{
		key: "black",
		label: "Black",
		min: 0,
		max: 1
	}
]);
var PAPER_TEXTURES = Object.freeze({
	"Craft light": new URL(new URL("Craft_Light-BWEd80i0.jpg", import.meta.url).href, "" + import.meta.url).href,
	"Craft rough": new URL(new URL("Craft_Rough-C1BFW9Y3.jpg", import.meta.url).href, "" + import.meta.url).href,
	"Watercolor cold press": new URL(new URL("Watercolor_ColdPress-vQy886_7.jpg", import.meta.url).href, "" + import.meta.url).href,
	Parchment: new URL(new URL("Parchment-BNuV2pAw.jpg", import.meta.url).href, "" + import.meta.url).href
});
var vertexShader = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
var fragmentShader = `
  precision highp float;
  uniform sampler2D colorTexture;
  uniform sampler2D normalTexture;
  uniform sampler2D paperTexture;
  uniform vec2 resolution;
  uniform vec3 inkColor;
  uniform float scale;
  uniform float thickness;
  uniform float contour;
  uniform float cyan;
  uniform float magenta;
  uniform float yellow;
  uniform float black;
  varying vec2 vUv;

  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>

  vec3 sobel(vec2 uv, vec2 offset) {
    vec3 tl = texture2D(normalTexture, uv + vec2(-offset.x, -offset.y)).rgb;
    vec3 tc = texture2D(normalTexture, uv + vec2(0.0, -offset.y)).rgb;
    vec3 tr = texture2D(normalTexture, uv + vec2(offset.x, -offset.y)).rgb;
    vec3 ml = texture2D(normalTexture, uv + vec2(-offset.x, 0.0)).rgb;
    vec3 mr = texture2D(normalTexture, uv + vec2(offset.x, 0.0)).rgb;
    vec3 bl = texture2D(normalTexture, uv + vec2(-offset.x, offset.y)).rgb;
    vec3 bc = texture2D(normalTexture, uv + vec2(0.0, offset.y)).rgb;
    vec3 br = texture2D(normalTexture, uv + vec2(offset.x, offset.y)).rgb;
    vec3 horizontal = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    vec3 vertical = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
    return sqrt(horizontal * horizontal + vertical * vertical);
  }

  vec2 rotateUV(vec2 uv, float degrees) {
    float angle = radians(degrees);
    float s = sin(angle), c = cos(angle);
    return mat2(c, -s, s, c) * uv;
  }

  float lines(float intensity, vec2 uv, float angle, float weight) {
    uv = rotateUV(uv, angle);
    float wave = 0.5 + 0.5 * sin(uv.x * resolution.x * 0.5);
    float value = (wave + weight) * intensity;
    // Full-screen UVs are linear, so these are the exact UV derivatives.
    // Computing them directly also works without the GLSL derivative extension.
    float aa = max(abs(cos(radians(angle))) * scale * length(1.0 / resolution), 0.00001);
    return smoothstep(0.5 - aa, 0.5 + aa, value);
  }

  void main() {
    // Three r160 render targets contain linear light without tone mapping.
    // Match the scene's ACES exposure before separating it into CMYK ink.
    vec3 color = texture2D(colorTexture, vUv).rgb;
    color = LinearTosRGB(vec4(ACESFilmicToneMapping(color), 1.0)).rgb;
    float normalEdge = 1.0;
    if (contour > 0.0) {
      normalEdge = 1.0 - length(sobel(vUv, vec2(contour) / resolution));
      float width = max(thickness, 0.00001);
      normalEdge = smoothstep(0.5 - width, 0.5 + width, normalEdge);
    }
    color *= normalEdge;
    vec3 cmy = 0.5 - 0.5 * clamp(color, 0.0, 1.0);
    float key = min(cmy.x, min(cmy.y, cmy.z));
    vec2 uv = scale * vUv;
    float c = lines(cmy.x, uv, 75.0, thickness * cyan);
    float m = lines(cmy.y, uv, 15.0, thickness * magenta);
    float y = lines(cmy.z, uv, 0.0, thickness * yellow);
    float k = lines(key, uv, 45.0, thickness * black);
    vec3 screen = mix(1.0 - vec3(c, m, y), inkColor, k);
    vec3 paper = texture2D(paperTexture, 0.00025 * vUv * resolution).rgb;
    // These are display-space ink/paper colors: no second tone/color transform.
    gl_FragColor = vec4(min(paper, screen), 1.0);
  }
`;
var CrossHatchEffect = class {
	constructor(renderer) {
		this.renderer = renderer;
		this.disposed = false;
		this.paperRequest = 0;
		const halfFloat = renderer.capabilities.isWebGL2 ? renderer.extensions.has("EXT_color_buffer_float") : renderer.extensions.has("EXT_color_buffer_half_float");
		this.colorTarget = new WebGLRenderTarget(1, 1, {
			type: halfFloat ? HalfFloatType : UnsignedByteType,
			depthBuffer: true,
			stencilBuffer: false
		});
		this.normalTarget = new WebGLRenderTarget(1, 1, { stencilBuffer: false });
		this.normalMaterial = new MeshNormalMaterial({ side: 2 });
		this.normalBackground = new Color().setRGB(.5, .5, 1);
		this.fallbackPaper = new DataTexture(new Uint8Array([
			239,
			224,
			190,
			255
		]), 1, 1);
		this.fallbackPaper.needsUpdate = true;
		this.uniforms = {
			colorTexture: { value: this.colorTarget.texture },
			normalTexture: { value: this.normalTarget.texture },
			paperTexture: { value: this.fallbackPaper },
			resolution: { value: new Vector2(1, 1) },
			toneMappingExposure: { value: renderer.toneMappingExposure },
			inkColor: { value: new Color(HATCH_DEFAULTS.inkColor) }
		};
		for (const { key } of HATCH_SLIDERS) this.uniforms[key] = { value: HATCH_DEFAULTS[key] };
		this.material = new RawShaderMaterial({
			uniforms: this.uniforms,
			vertexShader,
			fragmentShader,
			depthTest: false,
			depthWrite: false,
			toneMapped: false
		});
		this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
		this.quad.frustumCulled = false;
		this.postScene = new Scene();
		this.postScene.add(this.quad);
		this.postCamera = new Camera();
	}
	setParameter(key, value) {
		if (key === "inkColor") this.uniforms.inkColor.value.set(value).convertLinearToSRGB();
		else {
			const slider = HATCH_SLIDERS.find((slider) => slider.key === key);
			if (slider && Number.isFinite(value)) this.uniforms[key].value = MathUtils.clamp(value, slider.min, slider.max);
		}
	}
	async setPaper(name) {
		if (!Object.hasOwn(PAPER_TEXTURES, name)) throw new Error(`Unknown paper: ${name}`);
		const request = ++this.paperRequest;
		const texture = await new TextureLoader().loadAsync(PAPER_TEXTURES[name]);
		if (this.disposed || request !== this.paperRequest) {
			texture.dispose();
			return false;
		}
		texture.wrapS = texture.wrapT = RepeatWrapping;
		const previous = this.uniforms.paperTexture.value;
		this.uniforms.paperTexture.value = texture;
		if (previous !== this.fallbackPaper) previous.dispose();
		return true;
	}
	setSize(width, height) {
		width = Math.max(1, Math.round(width));
		height = Math.max(1, Math.round(height));
		this.colorTarget.setSize(width, height);
		this.normalTarget.setSize(width, height);
		this.uniforms.resolution.value.set(width, height);
	}
	render(scene, camera) {
		const renderer = this.renderer;
		const target = renderer.getRenderTarget();
		const overrideMaterial = scene.overrideMaterial;
		const background = scene.background;
		const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
		const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
		const hidden = [];
		try {
			renderer.setRenderTarget(this.colorTarget);
			renderer.render(scene, camera);
			scene.traverse((object) => {
				if (object.visible && (object.isSprite || object.isLine || object.isPoints)) {
					hidden.push(object);
					object.visible = false;
				}
			});
			scene.overrideMaterial = this.normalMaterial;
			scene.background = this.normalBackground;
			renderer.shadowMap.autoUpdate = false;
			renderer.shadowMap.needsUpdate = false;
			renderer.setRenderTarget(this.normalTarget);
			renderer.render(scene, camera);
		} finally {
			scene.overrideMaterial = overrideMaterial;
			scene.background = background;
			for (const object of hidden) object.visible = true;
			renderer.shadowMap.autoUpdate = shadowAutoUpdate;
			renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
			renderer.setRenderTarget(target);
		}
		this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
		renderer.render(this.postScene, this.postCamera);
	}
	dispose() {
		this.disposed = true;
		this.paperRequest++;
		this.colorTarget.dispose();
		this.normalTarget.dispose();
		this.normalMaterial.dispose();
		this.material.dispose();
		this.quad.geometry.dispose();
		const paper = this.uniforms.paperTexture.value;
		if (paper !== this.fallbackPaper) paper.dispose();
		this.fallbackPaper.dispose();
	}
};
//#endregion
//#region src/post-processing.js
function createPostProcessing(renderer, root, invalidate) {
	const select = root.querySelector("[data-action=\"effect\"]");
	const settings = root.querySelector("[data-hatch-settings]");
	const grid = root.querySelector("[data-hatch-sliders]");
	const paper = root.querySelector("[data-hatch-paper]");
	const ink = root.querySelector("[data-hatch-ink]");
	const status = root.querySelector("[data-hatch-status]");
	const params = { ...HATCH_DEFAULTS };
	let effect = null;
	let active = false;
	let paperRequest = 0;
	let loadedPaper = null;
	let width = 1, height = 1;
	for (const { key, label, min, max } of HATCH_SLIDERS) {
		const control = document.createElement("label");
		control.className = "hatch-control";
		control.htmlFor = `hatch-${key}`;
		const caption = document.createElement("span");
		caption.textContent = label;
		const output = document.createElement("output");
		output.htmlFor = control.htmlFor;
		const input = document.createElement("input");
		input.type = "range";
		input.className = "form-range";
		input.id = control.htmlFor;
		input.name = key;
		input.min = min;
		input.max = max;
		input.step = "0.01";
		input.value = params[key];
		output.value = Number(input.value).toFixed(2);
		input.addEventListener("input", () => {
			params[key] = input.valueAsNumber;
			output.value = params[key].toFixed(2);
			effect?.setParameter(key, params[key]);
			invalidate();
		});
		control.append(caption, output, input);
		grid.append(control);
	}
	for (const name of Object.keys(PAPER_TEXTURES)) paper.add(new Option(name, name));
	paper.value = params.paper;
	ink.value = params.inkColor;
	async function loadPaper() {
		const request = ++paperRequest;
		status.textContent = "Loading paper texture…";
		try {
			if (await effect.setPaper(params.paper) && request === paperRequest) {
				loadedPaper = params.paper;
				status.textContent = "";
				invalidate();
			}
		} catch (error) {
			if (request !== paperRequest) return;
			status.textContent = "Paper texture could not load. Select a paper to try again.";
			if (loadedPaper) paper.value = params.paper = loadedPaper;
			console.error("Cross-hatch paper texture:", error);
		}
	}
	select.addEventListener("change", () => {
		active = select.value === "cross-hatch";
		settings.hidden = !active;
		if (active && !effect) {
			effect = new CrossHatchEffect(renderer);
			effect.setSize(width, height);
			for (const { key } of HATCH_SLIDERS) effect.setParameter(key, params[key]);
			effect.setParameter("inkColor", params.inkColor);
			loadPaper();
		}
		invalidate();
	});
	paper.addEventListener("change", () => {
		params.paper = paper.value;
		loadPaper();
	});
	ink.addEventListener("input", () => {
		params.inkColor = ink.value;
		effect?.setParameter("inkColor", params.inkColor);
		invalidate();
	});
	root.querySelector("[data-action=\"reset-hatch\"]").addEventListener("click", () => {
		Object.assign(params, HATCH_DEFAULTS);
		for (const { key } of HATCH_SLIDERS) {
			const input = grid.querySelector(`[name="${key}"]`);
			input.value = params[key];
			input.previousElementSibling.value = params[key].toFixed(2);
			effect?.setParameter(key, params[key]);
		}
		ink.value = params.inkColor;
		effect?.setParameter("inkColor", params.inkColor);
		paper.value = params.paper;
		loadPaper();
		invalidate();
	});
	select.disabled = false;
	return {
		setSize(w, h) {
			width = w;
			height = h;
			effect?.setSize(w, h);
		},
		render(scene, camera) {
			if (active) effect.render(scene, camera);
			else renderer.render(scene, camera);
		},
		dispose() {
			paperRequest++;
			effect?.dispose();
		}
	};
}
//#endregion
export { createPostProcessing };
