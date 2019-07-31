export interface ColorRGB {
    r: number;
    g: number;
    b: number;
}

export function hexToRgb(hex: string): ColorRGB {
    if (hex.startsWith("#")) {
        hex = hex.substring(1);
    }

    const rgb = parseInt(hex, 16);

    if (isNaN(rgb)) {
        throw `Failed to parse hex number '${ hex }.'`;
    }

    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;

    return { r, g, b };
}

export function relativeLuminance(color: ColorRGB): number {
    return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}
