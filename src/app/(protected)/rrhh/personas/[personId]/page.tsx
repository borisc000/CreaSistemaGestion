import { HrPersonDetailPage } from "@/features/modules/hr-person-detail-page";

export default function HrPersonDetailRoute({ params }: { params: { personId: string } }) {
  return <HrPersonDetailPage personId={params.personId} />;
}
