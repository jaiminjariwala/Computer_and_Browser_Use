package httpapi

import (
	"html/template"
	"net/http"
)

// Stripe owns sensitive fields; neither Go nor Electron receives card numbers.
var checkoutTemplate = template.Must(template.New("checkout").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Codex Lite · Desktop access</title>
<script src="https://js.stripe.com/dahlia/stripe.js"></script>
<style>body{margin:0;background:#181818;color:#eee;font:16px -apple-system,BlinkMacSystemFont,sans-serif}main{max-width:440px;margin:48px auto;padding:28px;background:#262626;border-radius:22px}h1{font-size:28px}p{color:#bbb;line-height:1.5}button{width:100%;padding:14px;border:0;border-radius:12px;background:#eee;color:#181818;font-size:16px;margin-top:20px;cursor:pointer}button:disabled{opacity:.5}#error{color:#ffaaaa}input{box-sizing:border-box;width:100%;padding:12px;margin:10px 0 20px;background:#181818;color:white;border:1px solid #666;border-radius:8px}a{color:#ddd}</style></head>
<body><main><p>CODEX LITE</p><h1>Make room for your next idea.</h1><h2>$1 <small>USD / month</small></h2><p>Desktop access with local AI, chat, and your code workspace. Renews monthly until canceled in Manage subscription.</p>
<div id="wallet"></div><label for="email">Email for your receipt</label><input id="email" type="email" autocomplete="email" required>
<div id="payment"></div><p id="error" role="status">Loading secure payment form…</p><button id="pay" disabled>Subscribe for $1/month</button>
<p>Payments are processed securely by Stripe. Your bank may request verification. Apple Pay appears only on supported browsers and devices.</p><p><a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">Stripe privacy policy</a></p></main>
<script>
(async()=>{
const error=document.getElementById('error'), button=document.getElementById('pay');
try {
 const fragment=location.hash.slice(1);
 const secret=fragment?decodeURIComponent(fragment):sessionStorage.getItem('checkout-secret');
 history.replaceState(null,'',location.pathname);
 if(!secret)throw new Error('Open Subscribe from Codex Lite to start a secure checkout.');
 sessionStorage.setItem('checkout-secret',secret);
 const stripe=Stripe({{.}});
 const checkout=stripe.initCheckoutElementsSdk({clientSecret:secret,elementsOptions:{appearance:{theme:'night',variables:{colorBackground:'#262626',borderRadius:'10px'}}}});
 const loaded=await checkout.loadActions();
 if(loaded.type!=='success')throw new Error('Checkout could not load. Please restart it from the app.');
 const actions=loaded.actions;
 checkout.createPaymentElement().mount('#payment');
 const wallet=checkout.createExpressCheckoutElement();wallet.mount('#wallet');
 wallet.on('confirm',async event=>{const result=await actions.confirm({expressCheckoutConfirmEvent:event});if(result.type==='error')error.textContent=result.error.message;});
 error.textContent='';button.disabled=false;
 button.onclick=async()=>{
  const email=document.getElementById('email');if(!email.reportValidity())return;
  button.disabled=true;error.textContent='';
  try{const updated=await actions.updateEmail(email.value);if(updated.type==='error')throw new Error(updated.error.message);
  const result=await actions.confirm();if(result.type==='error')throw new Error(result.error.message);
  }catch(e){error.textContent=e.message;}finally{button.disabled=false;}
 };
}catch(e){error.textContent=e.message;}
})();
</script></body></html>`))

func (s *Server) checkoutPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	if s.config.StripePublishableKey == "" {
		http.Error(w, "Custom checkout needs STRIPE_PUBLISHABLE_KEY on the Go backend.", 503)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = checkoutTemplate.Execute(w, s.config.StripePublishableKey)
}
func (s *Server) checkoutReturn(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("Return to Codex Lite. Access will activate after Stripe confirms your subscription. If payment was canceled or failed, you can try again from the app."))
}
