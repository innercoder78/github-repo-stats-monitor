// DOM image simulation only; browser previews verify the actual packaged PNG.
export function simulatedFooterIcon({ fail = false } = {}) {
  return {
    naturalWidth: 128, naturalHeight: 128,
    removeAttribute() {},
    set src(value) {
      if (!value.endsWith('/assets/icons/icon-128.png')) throw new Error('Unexpected icon asset');
      queueMicrotask(() => fail ? this.onerror?.() : this.onload?.());
    },
  };
}
