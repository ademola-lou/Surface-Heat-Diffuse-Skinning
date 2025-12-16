cmake_minimum_required(VERSION 3.10)
project(surface_heat_diffuse)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Enable Emscripten specific flags
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} \
    -s DISABLE_EXCEPTION_CATCHING=2 \
    -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString'] \
    -s EXPORTED_FUNCTIONS=['_malloc','_free'] \
    -lembind \
    -s ASSERTIONS=2 \
    -s USE_PTHREADS=0 \
    -s PTHREAD_POOL_SIZE=0 \
    --bind"
)

# Add include directories
include_directories(
    ${PROJECT_SOURCE_DIR}/include
)

add_executable(surface_heat_diffuse 
    src/main.cpp
    src/tribox.cpp
    src/raytri.cpp
)

# Emscripten settings
set_target_properties(surface_heat_diffuse PROPERTIES
    LINK_FLAGS " \
        -s WASM=1 \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s NO_EXIT_RUNTIME=1 \
        -s MODULARIZE=1 \
        -s EXPORT_ES6=1 \
        -s EXPORT_NAME='createSurfaceHeatDiffuse' \
        -s ENVIRONMENT='web' \
        -s USE_ES6_IMPORT_META=0 \
        -s SINGLE_FILE=1 \
        -s DISABLE_EXCEPTION_CATCHING=0 \
        -s USE_PTHREADS=0 \
        --no-entry \
        -O3"
)

# Specify output name
set_target_properties(surface_heat_diffuse PROPERTIES OUTPUT_NAME "surface_heat_diffuse") 