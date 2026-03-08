import { ContractDetailPage } from "@/features/modules/contract-detail-page";

type RouteParams = {
  params: {
    contractId: string;
  };
};

export default function ContractDetailRoute({ params }: RouteParams) {
  return <ContractDetailPage contractId={params.contractId} />;
}
