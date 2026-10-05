import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { confirmMockPaymentAction } from "@/app/m/[slug]/pedido/[requestId]/actions";
import { getRequestVisitorToken } from "@/lib/security/request-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RequestPaymentPageProps = {
  params: Promise<{ slug: string; requestId: string }>;
  searchParams: Promise<{ estado?: string }>;
};

export default async function RequestPaymentPage({ params, searchParams }: RequestPaymentPageProps) {
  const [{ slug, requestId }, { estado }] = await Promise.all([params, searchParams]);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[0-9a-f-]{36}$/i.test(requestId)) notFound();

  const admin = createSupabaseAdminClient();
  const visitorToken = await getRequestVisitorToken();
  if (!admin || !visitorToken) notFound();

  const { data: request } = await admin
    .from("music_requests")
    .select("id, musician_id, song_id, price_cents, payment_status")
    .eq("id", requestId)
    .eq("requester_token", visitorToken)
    .maybeSingle();

  if (!request || request.price_cents <= 0) notFound();

  const { data: musician } = await admin
    .from("musicians")
    .select("slug")
    .eq("id", request.musician_id)
    .maybeSingle();
  if (!musician || musician.slug !== slug) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: song } = supabase
    ? await supabase.from("catalog_songs").select("title, artist").eq("id", request.song_id).maybeSingle()
    : { data: null };

  const mockEnabled = process.env.NODE_ENV === "development";
  const mockApproved = request.payment_status === "mock_paid";
  const price = (request.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <main className="public-page">
      <header className="public-header">
        <Link href={`/m/${slug}`} aria-label="Voltar à página do músico"><Brand compact /></Link>
        <span className="public-closed-pill">Pedido de música</span>
      </header>

      <div className="public-content">
        <section className="public-section request-payment-card">
          <span className={`request-payment-icon ${mockApproved ? "approved" : ""}`}>
            {mockApproved ? <CheckCircle2 size={24} /> : <ShieldCheck size={24} />}
          </span>
          <h1>{mockApproved ? "Pagamento de teste confirmado" : "Confirme seu pedido"}</h1>
          <p className="request-payment-song">{song?.title ?? "Música solicitada"}{song?.artist ? ` · ${song.artist}` : ""}</p>
          <strong className="request-payment-price">{price}</strong>

          {mockApproved ? (
            <p className="public-request-message success" role="status">Pedido confirmado e enviado para a fila do músico.</p>
          ) : request.payment_status === "pending" ? (
            mockEnabled ? (
              <>
                <p className="request-payment-note">Pagamento simulado para desenvolvimento. Nenhum valor real será cobrado.</p>
                <form action={confirmMockPaymentAction}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <button className="button button-primary request-payment-submit" type="submit">Simular pagamento aprovado</button>
                </form>
              </>
            ) : (
              <p className="request-payment-note">A cobrança ainda não está configurada. O pedido não será enviado à fila até que haja confirmação de pagamento.</p>
            )
          ) : (
            <p className="request-payment-note">Este pedido não está aguardando pagamento.</p>
          )}

          {estado === "configuracao" && <p className="public-request-message" role="status">O pagamento de teste está indisponível neste ambiente.</p>}
          {estado === "atualizar_banco" && <p className="public-request-message" role="status">Aplique as migrations de pedidos no Supabase para habilitar este fluxo.</p>}
          {estado === "preparacao" && <p className="public-request-message" role="status">Não foi possível validar apresentação ativa, licença vigente, perfil público e música aprovada no repertório.</p>}
          {estado === "indisponivel" && <p className="public-request-message" role="status">Não foi possível confirmar este pedido.</p>}
          <Link className="request-payment-back" href={`/m/${slug}`}><ArrowLeft size={15} /> Voltar à página do músico</Link>
        </section>
      </div>
    </main>
  );
}
