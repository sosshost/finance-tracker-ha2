"""Month-end reference balances; integer cents, no synthetic transactions."""
def balance(db, account, through=None, include_same=True):
    sql='SELECT month,actual_cents FROM ft_closings WHERE account_id=?'
    args=[account['id']]
    if through:
        sql+=' AND month '+ ('<=' if include_same and through.endswith('-31') else '<') +' ?'
        args.append(through[:7])
    anchor=db.execute(sql+' ORDER BY month DESC LIMIT 1',args).fetchone()
    sql='SELECT COALESCE(SUM(amount_cents),0) FROM ft_transactions WHERE account_id=? AND voided=0'
    args=[account['id']]
    if anchor:
        sql+=' AND booked>=? AND substr(booked,1,7)>?';args.extend([account['opening_date'],anchor['month']])
    if through:
        sql+=' AND booked<=?';args.append(through)
    return (anchor['actual_cents'] if anchor else account['opening_cents'])+db.execute(sql,args).fetchone()[0]


def differences(db):
    return { (r['month'],r['account_id']): {'actual':r['actual_cents'],'calculated':balance(db,r,r['month']+'-31',False)} for r in db.execute('SELECT c.*,a.id,a.opening_cents,a.opening_date FROM ft_closings c JOIN ft_accounts a ON a.id=c.account_id') }
