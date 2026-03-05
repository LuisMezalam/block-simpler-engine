import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-right"
      theme="dark"
      duration={2000}
      style={{ zIndex: 9999 }}
      {...props}
    />
  );
};

export { Toaster, toast };
