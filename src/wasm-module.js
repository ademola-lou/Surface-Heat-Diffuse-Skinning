let modulePromise = null;

export async function createSurfaceHeatDiffuse() {
    if (!modulePromise) {
        const { default: createModule } = await import('../build/surface_heat_diffuse.js');
        modulePromise = createModule();
    }
    return modulePromise;
} 