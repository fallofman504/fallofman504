import { OrderForm } from "@/components/order-form";
import { REFERENCE_ACCEPT } from "@/lib/storage";

export const metadata = { title: "Order a drawing" };

export default function OrderPage() {
  return (
    <main className="order">
      <div className="wrap"><OrderForm accept={REFERENCE_ACCEPT} /></div>
    </main>
  );
}
