import { Button } from "@hilla/react-components/Button.js";
import { Notification } from "@hilla/react-components/Notification.js";
import { TextField } from "@hilla/react-components/TextField.js";
import { useBinder, useField } from "Frontend/form/binder";
import PersonModel from "Frontend/generated/com/example/application/endpoints/helloreact/PersonModel";

export default function NestedModelForm() {
  const binder = useBinder(PersonModel);
  const name = useField(binder.model.name);
  const streetAddress = useField(binder.model.address.streetAddress);
  const city = useField(binder.model.address.city);
  const country = useField(binder.model.address.country);

  const AddressForm = (
    <fieldset className="flex p-m gap-m items-end">
      <legend>Address</legend>
      <TextField label="Street address" {...streetAddress} />
      <TextField label="City" {...city} />
      <TextField label="Country" {...country} />
    </fieldset>
  );

  return (
    <>
      <section className="flex p-m gap-m items-end">
        <TextField label="Your name" {...name} />
        {AddressForm}
        <Button
          onClick={async () => {
            Notification.show(JSON.stringify(binder.root.value));
          }}
        >
          Say hello
        </Button>
      </section>
    </>
  );
}
