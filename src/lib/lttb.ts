/**
 * Largest-Triangle-Three-Buckets (LTTB) downsampling algorithm.
 * Reduces a time-series to `threshold` points while preserving visual shape.
 * Reference: Sveinn Steinarsson, 2013.
 */

export interface LTTBPoint {
  x: number; // timestamp or index
  y: number; // value
}

export function lttb<T extends LTTBPoint>(data: T[], threshold: number): T[] {
  if (threshold >= data.length || threshold <= 2) return data;

  const sampled: T[] = [];
  const bucketSize = (data.length - 2) / (threshold - 2);

  // Always keep first point
  sampled.push(data[0]);

  let prevIndex = 0;

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate bucket range
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);

    // Calculate average point of next bucket (for triangle area)
    const nextBucketStart = Math.floor((i + 2) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length - 1);

    let avgX = 0;
    let avgY = 0;
    const nextLen = Math.max(1, nextBucketEnd - nextBucketStart + 1);

    for (let j = nextBucketStart; j <= Math.min(nextBucketEnd, data.length - 1); j++) {
      avgX += data[j].x;
      avgY += data[j].y;
    }
    avgX /= nextLen;
    avgY /= nextLen;

    // Find the point in current bucket with largest triangle area
    let maxArea = -1;
    let maxAreaIdx = bucketStart;

    const prevX = data[prevIndex].x;
    const prevY = data[prevIndex].y;

    for (let j = bucketStart; j < bucketEnd && j < data.length; j++) {
      const area = Math.abs(
        (prevX - avgX) * (data[j].y - prevY) -
        (prevX - data[j].x) * (avgY - prevY)
      );
      if (area > maxArea) {
        maxArea = area;
        maxAreaIdx = j;
      }
    }

    sampled.push(data[maxAreaIdx]);
    prevIndex = maxAreaIdx;
  }

  // Always keep last point
  sampled.push(data[data.length - 1]);

  return sampled;
}
