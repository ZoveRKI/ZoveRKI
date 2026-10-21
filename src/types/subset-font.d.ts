// subset-font 没有自带类型声明，这里只声明用到的部分
declare module 'subset-font' {
  type Options = {
    targetFormat?: 'sfnt' | 'truetype' | 'woff' | 'woff2';
    /** 保留的 OpenType 特性，传空数组表示全部去掉 */
    keepFeatures?: string[];
    noHinting?: boolean;
  };

  export default function subsetFont(font: Uint8Array, text: string, options?: Options): Promise<Buffer>;
}
