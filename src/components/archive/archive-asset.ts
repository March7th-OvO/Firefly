// Material construction ported from RhineLabUI scene.ts. See public/licenses/rhine-lab-ui.txt.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CardAppearance } from "./rhine/appearance";
import { configureInternalOptics } from "./rhine/internal-optics";

// 主体颜色统一作用于盖板、端面和背板，斜视时也能辨认当前文章。
const FILE_COLOR = "#2964D9";
const SELECTED_FILE_COLOR = "#022873";
export interface ArchiveAsset {
	template: THREE.Group;
	appearance: CardAppearance;
	layers: {
		geometry: THREE.BufferGeometry;
		material: THREE.MeshPhysicalMaterial;
	}[];
	dispose(): void;
}
export async function loadArchiveAsset(url: string): Promise<ArchiveAsset> {
	const gltf = await new GLTFLoader().loadAsync(url);
	gltf.scene.updateMatrixWorld(true);
	const meshes: THREE.Mesh[] = [];
	gltf.scene.traverse((o) => {
		if (o instanceof THREE.Mesh) meshes.push(o);
	});
	const template = new THREE.Group();
	const appearance = new CardAppearance();
	const layers: ArchiveAsset["layers"] = [];
	const look: string = "baseline";
	for (const mesh of meshes) {
		const geom = mesh.geometry
			.clone()
			.applyMatrix4(mesh.matrixWorld)
			.scale(1, 1, 1);
		const source = mesh.material as THREE.MeshStandardMaterial;
		const name = source.name.replace(/\.\d+$/, "");
		const mat = source.clone() as THREE.MeshPhysicalMaterial;
		mat.envMapIntensity = 0.6;
		if (name === "Frosted_Polymer") {
			mat.color.set("#fffdfa");
			mat.transmission = 0.9;
			mat.thickness = 0.12;
			mat.roughness = 0.21;
			mat.ior = 1.46;
			mat.attenuationColor = new THREE.Color("#eee6df");
			mat.attenuationDistance = 2;
		}
		if (name === "Internal_Ceramic") {
			mat.color.set(look === "refined" ? "#c4baae" : "#c7beb6");
			mat.roughness = 0.6;
		}
		if (name === "Printed_Label") mat.color.set("#eae5dc");
		if (name === "Ivory_Edges") {
			mat.color.set("#f0e7df");
			mat.roughness = 0.31;
			mat.transmission = 0.65;
			mat.thickness = 0.04;
		}
		if (name === "Optical_Diffuser") {
			mat.color.set("#e2dad4");
			mat.transmission = 0;
			mat.roughness = 0.7;
		}
		if (name === "Subsurface_Optics") {
			mat.color.set(look === "refined" ? "#b9a796" : "#b9aba1");
			mat.roughness = 0.48;
			mat.metalness = 0.05;
		}
		if (name === "Optical_Edges") {
			// Internal refractive shoulders must be in the opaque capture: WebGL's
			// screen-space transmission cannot recursively sample another glass mesh.
			mat.transmission = 0;
			mat.color.set(look === "refined" ? "#d8c7b5" : "#d4c7be");
			mat.roughness = 0.26;
			mat.metalness = 0.08;
		}
		configureInternalOptics(name, mat);
		if (name === "Carbon_Ink") {
			geom.dispose();
			mat.dispose();
			continue;
		}
		const selectedMesh = new THREE.Mesh(geom, mat);
		selectedMesh.userData.surface = name;
		selectedMesh.castShadow = name === "Optical_Diffuser";
		selectedMesh.receiveShadow = true;
		template.add(selectedMesh);
		// Only the shell, edge and fasteners remain visible within tightly packed rows.
		// Keep sub-millimetre optical/typographic geometry on the extracted cassette.
		if (
			![
				"Frosted_Polymer",
				"Ivory_Edges",
				"Titanium_Fasteners",
				"Index_Inlay",
				"Optical_Diffuser",
			].includes(name)
		) {
			appearance.register(name, mat);
			continue;
		}
		const arrayMat = mat.clone();
		if (name === "Frosted_Polymer") {
			arrayMat.transmission = 0.78;
			if (look === "refined") {
				// Longer oblique paths pick up the warm body tint, while the thin
				// edges and the extracted clear cover retain a brighter response.
				arrayMat.thickness = 0.28;
				arrayMat.attenuationColor.set("#d4c7b4");
				arrayMat.attenuationDistance = 1.2;
			}
			arrayMat.transparent = false;
			arrayMat.color.set("#fff7ed");
			arrayMat.onBeforeCompile = (shader) => {
				shader.vertexShader =
					"varying float vPanelHeight;\n" + shader.vertexShader;
				shader.vertexShader = shader.vertexShader.replace(
					"#include <begin_vertex>",
					"#include <begin_vertex>\nvPanelHeight = position.y / 3.7;",
				);
				shader.fragmentShader =
					"varying float vPanelHeight;\n" + shader.fragmentShader;
				shader.fragmentShader = shader.fragmentShader.replace(
					"#include <color_fragment>",
					"#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(0.55), vec3(1.0), smoothstep(0.1, 1.0, vPanelHeight));",
				);
			};
			arrayMat.roughness = 0.28;
			arrayMat.clearcoat = 0.3;
			arrayMat.clearcoatRoughness = 0.25;
		}
		if (name === "Optical_Diffuser") arrayMat.color.set("#806447");
		if (name === "Ivory_Edges") {
			arrayMat.transmission = 0;
			arrayMat.color.set(look === "refined" ? "#dcc9b0" : "#fff5e9");
			arrayMat.roughness = 0.38;
		}
		if (name === "Index_Inlay") {
			arrayMat.color.set("#e4d6c5");
			arrayMat.metalness = 0.05;
		}
		if (
			[
				"Frosted_Polymer",
				"Ivory_Edges",
				"Optical_Diffuser",
				"Index_Inlay",
			].includes(name)
		) {
			// 盖板保持中蓝染色；选中时仅实体变深蓝，避免两层深蓝叠乘近黑。
			arrayMat.color.set(FILE_COLOR);
			mat.color.set(
				name === "Frosted_Polymer" ? FILE_COLOR : SELECTED_FILE_COLOR,
			);
			// 使用中性吸收，避免旧香槟色将蓝色玻璃染浑。
			// GLB 的不透明背板仍为 StandardMaterial，仅透射材质有吸收色。
			arrayMat.attenuationColor?.set("#ffffff");
			mat.attenuationColor?.set("#ffffff");
			if (name === "Ivory_Edges") mat.transmission = 0;
		}
		appearance.register(name, mat, arrayMat);

		layers.push({ geometry: geom, material: arrayMat });
	}
	// GLB is untextured; baked world-space copies own their geometry/materials.
	for (const mesh of meshes) {
		mesh.geometry.dispose();
		for (const material of Array.isArray(mesh.material)
			? mesh.material
			: [mesh.material])
			material.dispose();
	}
	return {
		template,
		appearance,
		layers,
		dispose() {
			for (const mesh of template.children as THREE.Mesh[]) {
				mesh.geometry.dispose();
				(mesh.material as THREE.Material).dispose();
			}
			for (const layer of layers) layer.material.dispose();
		},
	};
}
