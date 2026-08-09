const formsListEl = document.getElementById("forms-list");

function renderEmpty() {
  formsListEl.innerHTML = `
    <div class="card">
      <h3>No forms yet</h3>
      <p>Create your first form from the admin panel.</p>
      <a class="btn" href="/admin/forms">Go to Admin</a>
    </div>
  `;
}

function renderForms(forms) {
  if (!forms.length) {
    renderEmpty();
    return;
  }

  formsListEl.innerHTML = "";
  forms.forEach((form) => {
    const card = document.createElement("article");
    card.className = "card";
    const publicUrl = `/forms/${form._id}`;
    card.innerHTML = `
      <h3>${form.name}</h3>
      <p class="hint">Type: ${form.moduleType} | Fields: ${form.schema?.fields?.length || 0}</p>
      <a class="btn" href="${publicUrl}">Open Form</a>
    `;
    formsListEl.appendChild(card);
  });
}

async function init() {
  try {
    const response = await fetch("/api/modules");
    if (!response.ok) {
      renderEmpty();
      return;
    }
    const forms = await response.json();
    renderForms(forms.filter((item) => item.isPublished));
  } catch (_err) {
    renderEmpty();
  }
}

init();
