import * as THREE from 'three';
import * as OrbitControls from 'three-orbitcontrols';
import * as d3 from 'd3';
import { feature as topojsonFeature } from 'topojson';
import { Mesh } from 'three';

export class Globe {
    private SEGMENT = 150;
    private RADIUS = 200;
    private frameId;
    private mountingElement;
    private width;
    private height;
    private baseGlobeGeometry;
    private earth;
    private scene;
    private camera;
    private renderer;

    constructor(mountingElement: HTMLElement) {
        this.mountingElement = mountingElement;
    }

    async init() {
        this.width = this.mountingElement.clientWidth;
        this.height = this.mountingElement.clientHeight;

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = this.setupCamera();

        // Light
        const light = this.setupLight();

        // Renderer
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(this.width, this.height);
        this.mountingElement.appendChild(this.renderer.domElement);

        // Base globe
        const baseGlobe = this.createBaseGlobe();

        const worldMapTopoJson = await d3.json('public/world.json');

        const countriesGeoJson = topojsonFeature(
            worldMapTopoJson,
            worldMapTopoJson.objects.countries,
        );

        const facesToCountriesMapping = this.mapFacesToCountries(this.baseGlobeGeometry, countriesGeoJson);

        // Map layer
        const mapLayer = this.createMapLayer(countriesGeoJson);

        this.earth = new THREE.Object3D();
        this.earth.scale.set(2.5, 2.5, 2.5);
        this.earth.add(<Mesh> baseGlobe);
        this.earth.add(mapLayer);
        this.scene.add(this.earth);
        this.scene.add(light);

        const orbitControls = new OrbitControls(this.camera);

        this.mountingElement.addEventListener('mousemove', this.createMouseMoveListener(baseGlobe, this.camera, facesToCountriesMapping));
    }

    setupCamera() {
        const camera = new THREE.PerspectiveCamera(
            70,
            this.width / this.height,
            1,
            5000,
        );
        camera.position.z = 1000;

        return camera;
    }

    setupLight() {
        const light = new THREE.HemisphereLight('#ffffff', '#666666', 1.5);
        light.position.set(0, 1000, 0);

        return light;
    }

    createBaseGlobe() {
        this.baseGlobeGeometry = new THREE.SphereGeometry(this.RADIUS, this.SEGMENT, this.SEGMENT);
        const material = new THREE.MeshPhongMaterial({ color: '#2B3B59', transparent: true });
        return new THREE.Mesh(this.baseGlobeGeometry, material);
    }

    createMapLayer(countries) {
        const worldTexture = mapTexture(countries);
        const material  = new THREE.MeshPhongMaterial({ map: worldTexture, transparent: true });
        const mapLayer = new THREE.Mesh(new THREE.SphereGeometry(this.RADIUS + 1, this.SEGMENT, this.SEGMENT), material);
        mapLayer.rotation.y = Math.PI * 1.5;

        return mapLayer;
    }

    mapFacesToCountries(sphere, countries) {
        const spherical = new THREE.Spherical();

        const store = sphere.faces.reduce((acc, face) => {
            const centerPoint = getCenterPoint(face, sphere);
            const localPoint = new THREE.Vector3(centerPoint.x, centerPoint.y, centerPoint.z);

            spherical.setFromVector3(localPoint);
            const lat = THREE.Math.radToDeg(Math.PI / 2 - spherical.phi);
            const lon = THREE.Math.radToDeg(spherical.theta);

            let match = false;

            let country;
            let coords;

            let result;

            for (let i = 0; i < countries.features.length; i++) {
                country = countries.features[i];
                if (country.geometry.type === 'Polygon') {
                    match = pointInPolygon(country.geometry.coordinates[0], [lon, lat]);
                    if (match) {
                        result = {
                            code: countries.features[i].id,
                            name: countries.features[i].properties.name,
                        };
                        break;
                    }
                } else if (country.geometry.type === 'MultiPolygon') {
                    coords = country.geometry.coordinates;
                    for (let j = 0; j < coords.length; j++) {
                        match = pointInPolygon(coords[j][0], [lon, lat]);
                        if (match) {
                            result = {
                                code: countries.features[i].id,
                                name: countries.features[i].properties.name,
                            };
                            break;
                        }
                    }
                }
            }

            acc[`${face.a}${face.b}${face.c}`] = result && result.code;
            return acc;
        }, {});

        return store;
    }

    createMouseMoveListener(baseGlobe, camera, facesToCountriesMapping) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        return (event) => {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(baseGlobe);
            if (intersects.length === 0) return;
            const face = intersects[0].face;
            const country = facesToCountriesMapping[`${face.a}${face.b}${face.c}`];
            console.log({ country });
        };
    }

    start() {
        if (!this.frameId) {
            this.frameId = requestAnimationFrame(this.animate);
        }
    }

    animate = () => {
        this.earth.rotation.y += 0.001;
        this.renderer.render(this.scene, this.camera);
        this.frameId = window.requestAnimationFrame(this.animate);
    }

    cleanUp() {
        cancelAnimationFrame(this.frameId);
        this.mountingElement.removeChild(this.renderer.domElement);
    }
}

function pointInPolygon(poly, point) {

    const x = point[0];
    const y = point[1];

    let inside = false;
    let xi;
    let xj;
    let yi;
    let yj;
    let xk;

    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        xi = poly[i][0];
        yi = poly[i][1];
        xj = poly[j][0];
        yj = poly[j][1];

        xk = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (xk) {
            inside = !inside;
        }
    }

    return inside;
}

function getCenterPoint(face, geometry) {
    return {
        x: (geometry.vertices[face.a].x + geometry.vertices[face.b].x + geometry.vertices[face.c].x) / 3,
        y: (geometry.vertices[face.a].y + geometry.vertices[face.b].y + geometry.vertices[face.c].y) / 3,
        z: (geometry.vertices[face.a].z + geometry.vertices[face.b].z + geometry.vertices[face.c].z) / 3,
    };
}

function mapTexture(geojson) {
    const projection = d3.geoEquirectangular()
        .translate([1024, 512])
        .scale(325);

    const canvas = d3.select('body').append('canvas')
        .style('display', 'none')
        .attr('width', '2048px')
        .attr('height', '1024px');

    const context = canvas.node().getContext('2d');

    const path = d3.geoPath(projection, context);

    context.strokeStyle = '#333';
    context.lineWidth = 1;
    context.fillStyle = '#CDB380';

    context.beginPath();

    path(geojson);

    context.fill();

    context.stroke();

    // DEBUGGING - Really expensive, disable when done.
    // console.log(canvas.node().toDataURL());

    const texture = new THREE.CanvasTexture(canvas.node());

    canvas.remove();

    return texture;
}
