precision highp float;

uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform sampler2D panorama;
uniform float u_width;
uniform float u_height;
uniform mat4 u_inverseView;
varying vec2 v_textureCoordinates;

mat4 rotationMatrix(vec3 axis, float angle)
{
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                0.0,                                0.0,                                0.0,                                1.0);
}

vec2 equirectangular(vec3 ray)
{
    // orig: vec3 stu = normalize(final.xyz) * vec3(-1.0, 1.0, 1.0);
    vec3 stu = normalize(ray.xyz);

    const float c_1Over2Pi = 0.1591549430918953357688837633725;
    const float c_1OverPi  = 0.3183098861837906715377675267450;

    float v = (acos(stu.y) * c_1OverPi);
    vec2 uv = vec2(atan(stu.x, stu.z) * c_1Over2Pi + 0.5, v);
    return uv;
}

vec2 sphere(vec3 ray)
{
    vec3 stu = normalize(ray) * vec3(-1.0, 1.0, -1.0);

    float z = 1.0 - stu.z;
    float m = sqrt(stu.x * stu.x + stu.y * stu.y + z * z);
    vec2 uv = 0.5 + 0.5 * vec2(+stu.x, -stu.y) / m;
    return uv;
}

vec2 polar(vec3 ray)
{
    vec3 stu = normalize(ray) * vec3(-1.0, 1.0, 1.0);

    stu.y = asin(stu.y) * 2.0 / 3.14159265359;
    float m = stu.y > 0.0 ? 1.0 + stu.y : 1.0 - stu.y;
    vec2 uv = 0.5 + 0.5 * vec2(stu.x, stu.z) / m;
    return uv;
}

void main(void)
{
    vec2 vertex = gl_FragCoord.xy / vec2(u_width, u_height) * 2.0 - 1.0;
    // czm_inverseProjection provided by Cesium
    vec4 ray = u_inverseView * czm_inverseProjection * vec4(vertex.xy, 1.0, 1.0);

    float pi = 3.14159265359;

    // 90° around x-axis
    mat4 rot = rotationMatrix(vec3(1.0, 0.0, 0.0), -pi / 2.0);
    // 45° around z-axis
    mat4 rot2 = rotationMatrix(vec3(0.0, 0.0, 1.0), pi / 4.0);
    // 20° around y-axis
    mat4 rot3 = rotationMatrix(vec3(0.0, 1.0, 0.0), pi / 8.5);
    // °  around x-axis
    mat4 rot4 = rotationMatrix(vec3(1.0, 0.0, 0.0), -pi / 20.5);
    vec4 rotated = rot4 * rot3 * rot2 * rot * ray;

    vec2 uv = equirectangular(rotated.xyz);

    vec4 color = texture2D(colorTexture, v_textureCoordinates);
    float depth = texture2D(depthTexture, v_textureCoordinates).x;
    vec4 pano = texture2D(panorama, uv);
    gl_FragColor = mix(color, pano, depth);
}
