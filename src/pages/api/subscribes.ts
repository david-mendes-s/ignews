import {NextApiRequest, NextApiResponse} from 'next';
import { query as q } from 'faunadb';
import { stripe } from '@/service/stripe';
import { getSession } from "next-auth/react";
import { fauna } from '@/service/fauna';

type User = {
    ref: {
        id: string;
    },
    data: {
        stripe_customer_id: string
    } 
}

export default async(req:NextApiRequest, res:NextApiResponse) => {
    if (req.method === 'POST') {

        const session = await getSession({req});
        
        const user = await fauna.query<User>(
            q.Get(
                q.Match(
                    q.Index('users_by_email'),
                    q.Casefold(session?.user?.email!)
                )
            )
        )

        let customer_id = user.data.stripe_customer_id;

        if(!customer_id){
            const stripeCustomer = await stripe.customers.create({
                email: session?.user?.email!,
            })

            await fauna.query(
                q.Update(
                    q.Ref(
                      q.Collection('users'), user.ref.id  
                    ), {
                        data: {stripe_customer_id: stripeCustomer.id}
                    }
                )
            );

            customer_id = stripeCustomer.id;
        }

        const sessionCheckoutStripe = await stripe.checkout.sessions.create({
            customer: customer_id,
            payment_method_types: ['card'],
            billing_address_collection: 'required',
            line_items: [
                {price: 'price_1MVhEpAqBf5UG3fHzrHocmRr', quantity: 1}
            ],
            mode: 'subscription',
            allow_promotion_codes: true,
            success_url: process.env.SUCCESS_URL_STRIPE!,
            cancel_url: process.env.CANCEL_URL_STRIPE,
        })

        return res.status(200).json({sessionId: sessionCheckoutStripe.id})

    } else {
      // Handle any other HTTP method
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method not allowed')
    }
  }