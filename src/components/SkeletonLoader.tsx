interface SkeletonLoaderProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  count?: number;
}

export function SkeletonLoader({
  width = "100%",
  height = "1rem",
  borderRadius = "6px",
  count = 1,
}: SkeletonLoaderProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          role="status"
          aria-label="Loading"
          style={{ width, height, borderRadius }}
        />
      ))}
    </>
  );
}
