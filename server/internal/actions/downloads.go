package actions

import "net/http"

// downloads is a read aggregation of live download throughput across SABnzbd
// and every qBt instance. It feeds both the Downloads tab and the Overview
// "ingest vs NAS write ceiling" bar. Same BFF, same creds — no new exporter.
//
// Every probe is best-effort: an unreachable client contributes null, so the
// screen shows that one tile as unavailable rather than failing the request.
func (s *Service) downloads(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	type qbtDl struct {
		Name  string `json:"name"`
		DlBps *int64 `json:"dlBps"`
		UpBps *int64 `json:"upBps"`
		Total *int   `json:"total"`
	}
	out := struct {
		SabBps   *float64 `json:"sabBps"`
		SabSlots *int     `json:"sabSlots"`
		QBt      []qbtDl  `json:"qbt"`
	}{}

	if s.cfg.SabURL != "" {
		if q, err := newSab(s.cfg.SabURL, s.cfg.SabAPIKey).queue(ctx); err == nil {
			out.SabBps = &q.SpeedBps
			out.SabSlots = &q.Slots
		}
	}
	for _, inst := range s.cfg.QBt {
		d := qbtDl{Name: inst.Name}
		if t, total, err := newQbt(inst).transfer(ctx); err == nil {
			dl, up, tot := t.DlBps, t.UpBps, total
			d.DlBps, d.UpBps, d.Total = &dl, &up, &tot
		}
		out.QBt = append(out.QBt, d)
	}
	writeJSON(w, http.StatusOK, out)
}
