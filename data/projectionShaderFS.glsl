precision highp float;

uniform sampler2D colorTexture;
uniform sampler2D panorama;
uniform float u_width;
uniform float u_height;
uniform mat4 u_inverseView;
varying vec2 v_textureCoordinates;

vec2 equirectangular(vec3 ray)
{
    vec3 stu = normalize(ray) * vec3(-1.0, 1.0, 1.0);

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
    vec2 vertex = (gl_FragCoord.xy / vec2(u_width, u_height)) * 2.0 - 1.0;
    // czm_inverseProjection provided by Cesium
    vec4 ray = u_inverseView * czm_inverseProjection * vec4(vertex.xy, 1.0, 1.0);

    vec2 uv = equirectangular(ray.xyz);

    vec4 color = texture2D(colorTexture, v_textureCoordinates);
    vec4 pano = texture2D(panorama, uv);
    gl_FragColor = mix(color, pano, 0.8);
}
